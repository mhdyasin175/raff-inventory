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
[Route("api/products")]
[Authorize]
public class ProductsController(AppDbContext db) : ControllerBase
{
    /// <summary>A product with its on-hand quantity in one warehouse (or across all of them when warehouse is null).</summary>
    private sealed class WithQty
    {
        public Product P { get; init; } = null!;
        public int Qty { get; init; }
    }

    private static IQueryable<WithQty> WithQuantity(IQueryable<Product> products, int? warehouseId) =>
        products.Select(p => new WithQty
        {
            P = p,
            Qty = p.StockLevels.Where(s => warehouseId == null || s.WarehouseId == warehouseId).Sum(s => (int?)s.Quantity) ?? 0,
        });

    private static IQueryable<ProductDto> Project(IQueryable<WithQty> q) =>
        q.Select(x => new ProductDto(
            x.P.Id, x.P.Sku, x.P.Name, x.P.CategoryId, x.P.Category.Name, x.P.Unit, x.P.Location,
            x.P.CostPrice, x.P.SalePrice, x.Qty, x.P.ReorderLevel, x.P.IsActive,
            x.Qty * x.P.CostPrice,
            x.Qty == 0 ? StockStatus.Out : x.Qty <= x.P.ReorderLevel ? StockStatus.Low : StockStatus.Ok,
            x.P.Movements.Max(m => (DateTime?)m.OccurredAt),
            x.P.Barcode));

    /// <param name="warehouseId">Show quantities for one warehouse; omit for the total across warehouses.</param>
    /// <param name="status">ok | low | out | attention</param>
    /// <param name="sort">name | sku | quantity | value | recent (prefix with - for descending)</param>
    [HttpGet]
    [Authorize(Policy = Permissions.ProductsView)]
    public async Task<PagedResult<ProductDto>> List(
        string? search, int? categoryId, string? status, int? warehouseId, bool includeInactive = false,
        string sort = "name", int page = 1, int pageSize = 20)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);
        var wid = User.ResolveWarehouse(warehouseId);

        var products = db.Products.AsNoTracking();
        if (!includeInactive) products = products.Where(p => p.IsActive);
        if (categoryId is > 0) products = products.Where(p => p.CategoryId == categoryId);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim();
            products = products.Where(p => p.Name.Contains(s) || p.Sku.Contains(s) || p.Barcode == s
                                           || (p.Location != null && p.Location.Contains(s)));
        }

        var q = WithQuantity(products, wid);
        q = status?.ToLowerInvariant() switch
        {
            "out" => q.Where(x => x.Qty == 0),
            "low" => q.Where(x => x.Qty > 0 && x.Qty <= x.P.ReorderLevel),
            "attention" => q.Where(x => x.Qty <= x.P.ReorderLevel),
            "ok" => q.Where(x => x.Qty > x.P.ReorderLevel),
            _ => q
        };

        var desc = sort.StartsWith('-');
        q = sort.TrimStart('-') switch
        {
            "sku" => desc ? q.OrderByDescending(x => x.P.Sku) : q.OrderBy(x => x.P.Sku),
            "quantity" => desc ? q.OrderByDescending(x => x.Qty) : q.OrderBy(x => x.Qty),
            "value" => desc ? q.OrderByDescending(x => x.Qty * x.P.CostPrice) : q.OrderBy(x => x.Qty * x.P.CostPrice),
            "recent" => desc ? q.OrderBy(x => x.P.Movements.Max(m => (DateTime?)m.OccurredAt))
                             : q.OrderByDescending(x => x.P.Movements.Max(m => (DateTime?)m.OccurredAt)),
            _ => desc ? q.OrderByDescending(x => x.P.Name) : q.OrderBy(x => x.P.Name),
        };

        var total = await q.CountAsync();
        var items = await Project(q.Skip((page - 1) * pageSize).Take(pageSize)).ToListAsync();
        return new PagedResult<ProductDto>(items, total, page, pageSize);
    }

    [HttpGet("{id:int}")]
    [Authorize(Policy = Permissions.ProductsView)]
    public async Task<ProductDto> Get(int id, int? warehouseId)
    {
        var wid = User.ResolveWarehouse(warehouseId);
        var rows = await Project(WithQuantity(db.Products.AsNoTracking().Where(p => p.Id == id), wid)).ToListAsync();
        return rows.FirstOrDefault() ?? throw AppException.NotFound("المنتج", "Product");
    }

    /// <summary>
    /// Finds the product a scanned code belongs to: its manufacturer barcode or its SKU
    /// (the code printed on Raff's own labels). Used by camera and USB scanners.
    /// </summary>
    [HttpGet("lookup")]
    [Authorize(Policy = Permissions.ProductsView)]
    public async Task<ProductDto> Lookup(string? code, int? warehouseId)
    {
        var c = code?.Trim() ?? "";
        if (c.Length == 0) throw new AppException(Msg.T("أدخل رمزاً أو امسح باركود", "Enter or scan a code"));
        var sku = c.ToUpperInvariant();
        var wid = User.ResolveWarehouse(warehouseId);

        var rows = await Project(WithQuantity(
            db.Products.AsNoTracking().Where(p => p.Barcode == c || p.Sku == sku), wid)).ToListAsync();
        return rows.OrderByDescending(r => r.Barcode == c).FirstOrDefault()
               ?? throw new AppException(Msg.T($"لا يوجد منتج بالرمز {c}", $"No product has the code {c}"), StatusCodes.Status404NotFound);
    }

    /// <summary>On-hand quantity of one product in every active warehouse (zero where it has none).</summary>
    [HttpGet("{id:int}/stock")]
    [Authorize(Policy = Permissions.ProductsView)]
    public async Task<List<ProductStockDto>> Stock(int id)
    {
        if (!await db.Products.AnyAsync(p => p.Id == id)) throw AppException.NotFound("المنتج", "Product");
        return await db.Warehouses.AsNoTracking()
            .Where(w => w.IsActive)
            .OrderBy(w => w.Id)
            .Select(w => new ProductStockDto(w.Id, w.Code, w.Name,
                w.StockLevels.Where(s => s.ProductId == id).Sum(s => (int?)s.Quantity) ?? 0))
            .ToListAsync();
    }

    /// <summary>Suggests the next free SKU for a category prefix, e.g. ELC-0135.</summary>
    [HttpGet("next-sku")]
    [Authorize(Policy = Permissions.ProductsManage)]
    public async Task<object> NextSku(string prefix)
    {
        prefix = new string(prefix.Trim().ToUpperInvariant().Where(char.IsLetterOrDigit).Take(5).ToArray());
        if (prefix.Length == 0) prefix = "PRD";
        var skus = await db.Products.Where(p => p.Sku.StartsWith(prefix + "-")).Select(p => p.Sku).ToListAsync();
        var max = skus.Select(s => int.TryParse(s[(prefix.Length + 1)..], out var n) ? n : 0).DefaultIfEmpty(100).Max();
        return new { sku = $"{prefix}-{max + 1:0000}" };
    }

    [HttpPost]
    [Authorize(Policy = Permissions.ProductsManage)]
    public async Task<ProductDto> Create(ProductInput input)
    {
        await ValidateAsync(input, null);

        var p = new Product();
        Apply(p, input);
        db.Products.Add(p);

        if (input.OpeningQuantity > 0)
        {
            // Opening stock goes to the chosen warehouse, the user's own one, or the first active warehouse.
            var wid = User.ResolveWarehouse(input.OpeningWarehouseId)
                      ?? (await db.Warehouses.Where(w => w.IsActive).OrderBy(w => w.Id).Select(w => w.Id).ToListAsync()).FirstOrDefault();
            if (wid == 0 || !await db.Warehouses.AnyAsync(w => w.Id == wid && w.IsActive))
                throw new AppException(Msg.T("المستودع المختار غير متاح", "The selected warehouse isn't available"));

            p.StockLevels.Add(new StockLevel { WarehouseId = wid, Quantity = input.OpeningQuantity });
            db.StockMovements.Add(new StockMovement
            {
                Product = p,
                WarehouseId = wid,
                Type = MovementType.In,
                QuantityChange = input.OpeningQuantity,
                BalanceAfter = input.OpeningQuantity,
                UnitPrice = input.CostPrice,
                Note = Msg.T("رصيد افتتاحي", "Opening balance"),
                OccurredAt = DateTime.UtcNow,
                CreatedById = User.GetUserId(),
            });
        }

        await db.SaveChangesAsync();
        return await Get(p.Id, null);
    }

    [HttpPut("{id:int}")]
    [Authorize(Policy = Permissions.ProductsManage)]
    public async Task<ProductDto> Update(int id, ProductInput input)
    {
        var p = await db.Products.FindAsync(id) ?? throw AppException.NotFound("المنتج", "Product");
        await ValidateAsync(input, id);
        Apply(p, input); // quantity is intentionally NOT editable here: use a stock adjustment
        p.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await Get(id, null);
    }

    /// <summary>Deletes a product with no history; otherwise archives it so the audit trail stays intact.</summary>
    [HttpDelete("{id:int}")]
    [Authorize(Policy = Permissions.ProductsManage)]
    public async Task<object> Delete(int id)
    {
        var p = await db.Products.FindAsync(id) ?? throw AppException.NotFound("المنتج", "Product");
        var hasHistory = await db.StockMovements.AnyAsync(m => m.ProductId == id);
        if (hasHistory)
        {
            p.IsActive = false;
            p.UpdatedAt = DateTime.UtcNow;
        }
        else
        {
            db.Products.Remove(p);
        }
        await db.SaveChangesAsync();
        return new { archived = hasHistory };
    }

    private async Task ValidateAsync(ProductInput input, int? id)
    {
        var sku = input.Sku.Trim().ToUpperInvariant();
        if (await db.Products.AnyAsync(p => p.Sku == sku && p.Id != id))
            throw AppException.Conflict(Msg.T($"الرمز {sku} مستخدم لمنتج آخر", $"Code {sku} is used by another product"));
        if (!await db.Categories.AnyAsync(c => c.Id == input.CategoryId))
            throw new AppException(Msg.T("التصنيف المختار غير موجود", "The selected category doesn't exist"));

        var barcode = string.IsNullOrWhiteSpace(input.Barcode) ? null : input.Barcode.Trim();
        if (barcode is null) return;
        if (Barcodes.IsGtin(barcode) && !Barcodes.HasValidCheckDigit(barcode))
            throw new AppException(Msg.T(
                $"الباركود {barcode} غير صحيح: الرقم الأخير (رقم التحقق) لا يطابق. تأكد من نسخه كاملاً",
                $"Barcode {barcode} isn't valid: its last (check) digit doesn't match. Check it was copied in full"));
        if (await db.Products.AnyAsync(p => p.Barcode == barcode && p.Id != id))
            throw AppException.Conflict(Msg.T($"الباركود {barcode} مستخدم لمنتج آخر", $"Barcode {barcode} is used by another product"));
    }

    private static void Apply(Product p, ProductInput input)
    {
        p.Sku = input.Sku.Trim().ToUpperInvariant();
        p.Barcode = string.IsNullOrWhiteSpace(input.Barcode) ? null : input.Barcode.Trim();
        p.Name = input.Name.Trim();
        p.CategoryId = input.CategoryId;
        p.Unit = input.Unit.Trim();
        p.Location = string.IsNullOrWhiteSpace(input.Location) ? null : input.Location.Trim().ToUpperInvariant();
        p.CostPrice = input.CostPrice;
        p.SalePrice = input.SalePrice;
        p.ReorderLevel = input.ReorderLevel;
        p.IsActive = input.IsActive;
    }
}
