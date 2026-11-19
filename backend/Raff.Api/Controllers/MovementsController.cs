using System.Globalization;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Raff.Api.Auth;
using Raff.Api.Data;
using Raff.Api.Domain;
using Raff.Api.Dtos;
using Raff.Api.Infrastructure;

namespace Raff.Api.Controllers;

[ApiController]
[Route("api/movements")]
[Authorize]
public class MovementsController(AppDbContext db) : ControllerBase
{
    /// <param name="Type">In | Out | Adjustment | Transfer (both transfer legs)</param>
    /// <param name="Tz">Client's offset from UTC in minutes (Damascus = 180) so "today" means the user's today.</param>
    public record Filter(
        string? Type, int? ProductId, int? WarehouseId, DateOnly? From, DateOnly? To, string? Search,
        int Page = 1, int PageSize = 25, int Tz = 0);

    private IQueryable<StockMovement> Apply(Filter f)
    {
        var q = db.StockMovements.AsNoTracking();
        var wid = User.ResolveWarehouse(f.WarehouseId);
        if (wid is not null) q = q.Where(m => m.WarehouseId == wid);

        q = f.Type?.ToLowerInvariant() switch
        {
            "in" => q.Where(m => m.Type == MovementType.In),
            "out" => q.Where(m => m.Type == MovementType.Out),
            "adjustment" => q.Where(m => m.Type == MovementType.Adjustment),
            "transfer" or "transferout" or "transferin" => q.Where(m => m.Type == MovementType.TransferOut || m.Type == MovementType.TransferIn),
            _ => q,
        };
        if (f.ProductId is > 0) q = q.Where(m => m.ProductId == f.ProductId);
        if (f.From is { } from) q = q.Where(m => m.OccurredAt >= from.ToDateTime(TimeOnly.MinValue).AddMinutes(-f.Tz));
        if (f.To is { } to) q = q.Where(m => m.OccurredAt < to.AddDays(1).ToDateTime(TimeOnly.MinValue).AddMinutes(-f.Tz));
        if (!string.IsNullOrWhiteSpace(f.Search))
        {
            var s = f.Search.Trim();
            q = q.Where(m => m.Product.Name.Contains(s) || m.Product.Sku.Contains(s)
                             || (m.Party != null && m.Party.Contains(s))
                             || (m.Reference != null && m.Reference.Contains(s)));
        }
        return q;
    }

    internal static IQueryable<MovementDto> Project(IQueryable<StockMovement> q) =>
        q.Select(m => new MovementDto(m.Id, m.ProductId, m.Product.Name, m.Product.Sku, m.Product.Unit, m.Type,
            m.QuantityChange, m.BalanceAfter, m.UnitPrice, Math.Abs(m.QuantityChange) * m.UnitPrice,
            m.Party, m.Reference, m.Note, m.OccurredAt, m.CreatedBy.FullName,
            m.WarehouseId, m.Warehouse.Code, m.Warehouse.Name,
            m.CounterpartWarehouseId, m.CounterpartWarehouse != null ? m.CounterpartWarehouse.Code : null, m.TransferId));

    [HttpGet]
    [Authorize(Policy = Permissions.MovementsView)]
    public async Task<PagedResult<MovementDto>> List([FromQuery] Filter f)
    {
        var page = Math.Max(1, f.Page);
        var size = Math.Clamp(f.PageSize, 1, 200);
        var q = Apply(f);
        var total = await q.CountAsync();
        var items = await Project(q.OrderByDescending(m => m.OccurredAt).ThenByDescending(m => m.Id)
            .Skip((page - 1) * size).Take(size)).ToListAsync();
        return new PagedResult<MovementDto>(items, total, page, size);
    }

    /// <summary>
    /// Records a stock movement in one warehouse, or a transfer between two (Type = TransferOut,
    /// WarehouseId = source, ToWarehouseId = destination). Both legs of a transfer are saved together:
    /// either the stock leaves A and arrives in B, or nothing changes.
    /// </summary>
    [HttpPost]
    public async Task<MovementDto> Create(MovementInput input)
    {
        var required = input.Type switch
        {
            MovementType.In => Permissions.MovementsIn,
            MovementType.Out => Permissions.MovementsOut,
            MovementType.Adjustment => Permissions.MovementsAdjust,
            MovementType.TransferOut => Permissions.MovementsTransfer,
            _ => throw new AppException(Msg.T("لتسجيل نقل استخدم النوع TransferOut", "To record a transfer, use type TransferOut")),
        };
        if (!User.HasClaim(Permissions.ClaimType, required))
            throw new AppException(Msg.T("لا تملك صلاحية تسجيل هذا النوع من الحركات", "You don't have permission to record this type of movement"),
                StatusCodes.Status403Forbidden);

        if (input.WarehouseId <= 0) throw new AppException(Msg.T("اختر المستودع", "Choose a warehouse"));
        var warehouseId = User.ResolveWarehouse(input.WarehouseId)!.Value;
        var warehouse = await ActiveWarehouse(warehouseId);

        var product = await db.Products.FirstOrDefaultAsync(p => p.Id == input.ProductId)
                      ?? throw AppException.NotFound("المنتج", "Product");
        if (!product.IsActive)
            throw new AppException(Msg.T("المنتج مؤرشف، أعد تفعيله قبل تسجيل حركات عليه", "This product is archived. Reactivate it before recording movements"));

        var occurred = input.OccurredAt?.ToUniversalTime() ?? DateTime.UtcNow;
        if (occurred > DateTime.UtcNow.AddMinutes(5))
            throw new AppException(Msg.T("لا يمكن تسجيل حركة بتاريخ مستقبلي", "A movement can't be dated in the future"));

        var level = await Level(product.Id, warehouse.Id);
        var userId = User.GetUserId();
        StockMovement Movement(MovementType type, Warehouse wh, int change, int balance) => new()
        {
            ProductId = product.Id,
            WarehouseId = wh.Id,
            Type = type,
            QuantityChange = change,
            BalanceAfter = balance,
            UnitPrice = input.UnitPrice ?? (type == MovementType.Out ? product.SalePrice : product.CostPrice),
            Party = input.Party?.Trim(),
            Reference = input.Reference?.Trim(),
            Note = input.Note?.Trim(),
            OccurredAt = occurred,
            CreatedById = userId,
        };

        StockMovement result;
        switch (input.Type)
        {
            case MovementType.In:
                RequirePositive(input.Quantity);
                level.Quantity += input.Quantity;
                result = Movement(MovementType.In, warehouse, input.Quantity, level.Quantity);
                break;

            case MovementType.Out:
                RequirePositive(input.Quantity);
                RequireAvailable(level, input.Quantity, product, warehouse);
                level.Quantity -= input.Quantity;
                result = Movement(MovementType.Out, warehouse, -input.Quantity, level.Quantity);
                break;

            case MovementType.Adjustment: // Quantity is what was physically counted in this warehouse
                var change = input.Quantity - level.Quantity;
                if (change == 0)
                    throw new AppException(Msg.T("الكمية المعدودة مطابقة للرصيد، لا حاجة لتسوية", "The counted quantity matches the balance; no adjustment needed"));
                if (string.IsNullOrWhiteSpace(input.Note))
                    throw new AppException(Msg.T("اكتب سبب التسوية في الملاحظات", "Write the reason for the adjustment in the notes"));
                level.Quantity = input.Quantity;
                result = Movement(MovementType.Adjustment, warehouse, change, level.Quantity);
                break;

            default: // TransferOut: two legs, saved together
                RequirePositive(input.Quantity);
                if (input.ToWarehouseId is not > 0)
                    throw new AppException(Msg.T("اختر المستودع المستلم", "Choose the receiving warehouse"));
                if (input.ToWarehouseId == warehouse.Id)
                    throw new AppException(Msg.T("لا يمكن النقل إلى نفس المستودع", "Source and destination must be different warehouses"));
                var target = await ActiveWarehouse(input.ToWarehouseId.Value);
                RequireAvailable(level, input.Quantity, product, warehouse);

                var targetLevel = await Level(product.Id, target.Id);
                level.Quantity -= input.Quantity;
                targetLevel.Quantity += input.Quantity;

                var transferId = Guid.NewGuid();
                result = Movement(MovementType.TransferOut, warehouse, -input.Quantity, level.Quantity);
                result.CounterpartWarehouseId = target.Id;
                result.TransferId = transferId;
                result.UnitPrice = input.UnitPrice ?? product.CostPrice;

                var arrival = Movement(MovementType.TransferIn, target, input.Quantity, targetLevel.Quantity);
                arrival.CounterpartWarehouseId = warehouse.Id;
                arrival.TransferId = transferId;
                arrival.UnitPrice = result.UnitPrice;
                db.StockMovements.Add(arrival);
                break;
        }

        product.UpdatedAt = DateTime.UtcNow;
        db.StockMovements.Add(result);

        try
        {
            await db.SaveChangesAsync(); // one transaction for every row above
        }
        catch (DbUpdateException) // concurrency token, or a duplicate StockLevel created at the same moment
        {
            throw AppException.Conflict(Msg.T(
                "تغيّر رصيد هذا المنتج للتو من مستخدم آخر. حدّث الصفحة وأعد المحاولة",
                "Another user just changed this product's stock. Refresh and try again"));
        }

        return (await Project(db.StockMovements.Where(m => m.Id == result.Id)).ToListAsync()).Single();
    }

    private async Task<Warehouse> ActiveWarehouse(int id)
    {
        var w = await db.Warehouses.FindAsync(id) ?? throw AppException.NotFound("المستودع", "Warehouse");
        if (!w.IsActive)
            throw new AppException(Msg.T($"المستودع {w.Name} موقوف", $"Warehouse {w.Name} is deactivated"));
        return w;
    }

    /// <summary>The tracked stock row for a product in a warehouse, created (at zero) if it doesn't exist yet.</summary>
    private async Task<StockLevel> Level(int productId, int warehouseId)
    {
        var level = await db.StockLevels.FindAsync(productId, warehouseId);
        if (level is null)
        {
            level = new StockLevel { ProductId = productId, WarehouseId = warehouseId, Quantity = 0 };
            db.StockLevels.Add(level);
        }
        return level;
    }

    private static void RequirePositive(int quantity)
    {
        if (quantity <= 0) throw new AppException(Msg.T("أدخل كمية أكبر من صفر", "Enter a quantity greater than zero"));
    }

    private static void RequireAvailable(StockLevel level, int quantity, Product product, Warehouse warehouse)
    {
        if (quantity > level.Quantity)
            throw new AppException(Msg.T(
                $"المتوفر في {warehouse.Name} {level.Quantity} {product.Unit} فقط",
                $"Only {level.Quantity} {product.Unit} available in {warehouse.Name}"));
    }

    /// <summary>CSV export (UTF-8 with BOM so Excel shows Arabic correctly).</summary>
    [HttpGet("export")]
    [Authorize(Policy = Permissions.ReportsView)]
    public async Task<IActionResult> Export([FromQuery] Filter f)
    {
        var rows = await Project(Apply(f).OrderByDescending(m => m.OccurredAt)).Take(50_000).ToListAsync();

        static string Esc(string? v) =>
            string.IsNullOrEmpty(v) ? "" : v.IndexOfAny([',', '"', '\n', '\r']) >= 0 ? $"\"{v.Replace("\"", "\"\"")}\"" : v;

        string TypeName(MovementType t) => t switch
        {
            MovementType.In => Msg.T("إدخال", "In"),
            MovementType.Out => Msg.T("إخراج", "Out"),
            MovementType.TransferOut => Msg.T("نقل صادر", "Transfer out"),
            MovementType.TransferIn => Msg.T("نقل وارد", "Transfer in"),
            _ => Msg.T("تسوية", "Adjustment"),
        };

        var sb = new StringBuilder();
        sb.AppendLine(Msg.T(
            "التاريخ,المستودع,النوع,الرمز,المنتج,الكمية,الوحدة,سعر الوحدة,الإجمالي,الرصيد بعد,الجهة,المرجع,ملاحظات,المستخدم",
            "Date,Warehouse,Type,Code,Product,Quantity,Unit,Unit price,Total,Balance after,Party,Reference,Notes,User"));
        var inv = CultureInfo.InvariantCulture;
        foreach (var r in rows)
        {
            var party = r.CounterpartWarehouseCode is { } other ? $"<> {other}" : r.Party;
            sb.AppendJoin(',',
                r.OccurredAt.AddMinutes(f.Tz).ToString("yyyy-MM-dd HH:mm", inv), Esc(r.WarehouseCode), TypeName(r.Type),
                Esc(r.Sku), Esc(r.ProductName), r.QuantityChange.ToString(inv), Esc(r.Unit),
                r.UnitPrice.ToString("0.00", inv), r.Total.ToString("0.00", inv), r.BalanceAfter.ToString(inv),
                Esc(party), Esc(r.Reference), Esc(r.Note), Esc(r.CreatedBy));
            sb.AppendLine();
        }

        var bytes = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(sb.ToString())).ToArray();
        return File(bytes, "text/csv; charset=utf-8", $"movements-{DateTime.UtcNow:yyyyMMdd-HHmm}.csv");
    }
}
