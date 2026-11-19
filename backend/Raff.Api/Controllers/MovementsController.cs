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
    public record Filter(
        MovementType? Type, int? ProductId, DateOnly? From, DateOnly? To, string? Search,
        int Page = 1, int PageSize = 25,
        int Tz = 0); // client's offset from UTC in minutes (Damascus = 180) so "today" means the user's today

    private IQueryable<StockMovement> Apply(Filter f)
    {
        var q = db.StockMovements.AsNoTracking();
        if (f.Type is not null) q = q.Where(m => m.Type == f.Type);
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

    private static IQueryable<MovementDto> Project(IQueryable<StockMovement> q) =>
        q.Select(m => new MovementDto(m.Id, m.ProductId, m.Product.Name, m.Product.Sku, m.Product.Unit, m.Type,
            m.QuantityChange, m.BalanceAfter, m.UnitPrice, Math.Abs(m.QuantityChange) * m.UnitPrice,
            m.Party, m.Reference, m.Note, m.OccurredAt, m.CreatedBy.FullName));

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

    [HttpPost]
    public async Task<MovementDto> Create(MovementInput input)
    {
        var required = input.Type switch
        {
            MovementType.In => Permissions.MovementsIn,
            MovementType.Out => Permissions.MovementsOut,
            _ => Permissions.MovementsAdjust,
        };
        if (!User.HasClaim(Permissions.ClaimType, required))
            throw new AppException(Msg.T("لا تملك صلاحية تسجيل هذا النوع من الحركات", "You don't have permission to record this type of movement"), StatusCodes.Status403Forbidden);

        var product = await db.Products.FirstOrDefaultAsync(p => p.Id == input.ProductId)
                      ?? throw AppException.NotFound("المنتج", "Product");
        if (!product.IsActive)
            throw new AppException(Msg.T("المنتج مؤرشف، أعد تفعيله قبل تسجيل حركات عليه", "This product is archived. Reactivate it before recording movements"));

        int change;
        switch (input.Type)
        {
            case MovementType.In:
                if (input.Quantity <= 0) throw new AppException(Msg.T("أدخل كمية أكبر من صفر", "Enter a quantity greater than zero"));
                change = input.Quantity;
                break;
            case MovementType.Out:
                if (input.Quantity <= 0) throw new AppException(Msg.T("أدخل كمية أكبر من صفر", "Enter a quantity greater than zero"));
                if (input.Quantity > product.Quantity)
                    throw new AppException(Msg.T($"الكمية المتوفرة {product.Quantity} {product.Unit} فقط", $"Only {product.Quantity} {product.Unit} available"));
                change = -input.Quantity;
                break;
            default: // Adjustment: Quantity is what was physically counted
                change = input.Quantity - product.Quantity;
                if (change == 0) throw new AppException(Msg.T("الكمية المعدودة مطابقة للرصيد، لا حاجة لتسوية", "The counted quantity matches the balance; no adjustment needed"));
                if (string.IsNullOrWhiteSpace(input.Note))
                    throw new AppException(Msg.T("اكتب سبب التسوية في الملاحظات", "Write the reason for the adjustment in the notes"));
                break;
        }

        product.Quantity += change;
        product.UpdatedAt = DateTime.UtcNow;

        var occurred = input.OccurredAt?.ToUniversalTime() ?? DateTime.UtcNow;
        if (occurred > DateTime.UtcNow.AddMinutes(5))
            throw new AppException(Msg.T("لا يمكن تسجيل حركة بتاريخ مستقبلي", "A movement can't be dated in the future"));

        var movement = new StockMovement
        {
            ProductId = product.Id,
            Type = input.Type,
            QuantityChange = change,
            BalanceAfter = product.Quantity,
            UnitPrice = input.UnitPrice ?? (input.Type == MovementType.Out ? product.SalePrice : product.CostPrice),
            Party = input.Party?.Trim(),
            Reference = input.Reference?.Trim(),
            Note = input.Note?.Trim(),
            OccurredAt = occurred,
            CreatedById = User.GetUserId(),
        };
        db.StockMovements.Add(movement);

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            throw AppException.Conflict(Msg.T("تغيّر رصيد هذا المنتج للتو من مستخدم آخر. حدّث الصفحة وأعد المحاولة", "Another user just changed this product's stock. Refresh and try again"));
        }

        return await Project(db.StockMovements.Where(m => m.Id == movement.Id)).FirstAsync();
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
            _ => Msg.T("تسوية", "Adjustment"),
        };

        var sb = new StringBuilder();
        sb.AppendLine(Msg.T(
            "التاريخ,النوع,الرمز,المنتج,الكمية,الوحدة,سعر الوحدة,الإجمالي,الرصيد بعد,الجهة,المرجع,ملاحظات,المستخدم",
            "Date,Type,Code,Product,Quantity,Unit,Unit price,Total,Balance after,Party,Reference,Notes,User"));
        var inv = CultureInfo.InvariantCulture;
        foreach (var r in rows)
        {
            sb.AppendJoin(',',
                r.OccurredAt.AddMinutes(f.Tz).ToString("yyyy-MM-dd HH:mm", inv), TypeName(r.Type), Esc(r.Sku), Esc(r.ProductName),
                r.QuantityChange.ToString(inv), Esc(r.Unit), r.UnitPrice.ToString("0.00", inv), r.Total.ToString("0.00", inv),
                r.BalanceAfter.ToString(inv), Esc(r.Party), Esc(r.Reference), Esc(r.Note), Esc(r.CreatedBy));
            sb.AppendLine();
        }

        var bytes = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(sb.ToString())).ToArray();
        return File(bytes, "text/csv; charset=utf-8", $"movements-{DateTime.UtcNow:yyyyMMdd-HHmm}.csv");
    }
}
