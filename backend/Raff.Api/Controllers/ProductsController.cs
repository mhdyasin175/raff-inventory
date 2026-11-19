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
    private record Row(
        int Id, string Sku, string Name, int CategoryId, string CategoryName, string Unit, string? Location,
        decimal CostPrice, decimal SalePrice, int Quantity, int ReorderLevel, bool IsActive, DateTime? LastMovementAt);

    private static IQueryable<Row> Project(IQueryable<Product> q) =>
        q.Select(p => new Row(p.Id, p.Sku, p.Name, p.CategoryId, p.Category.Name, p.Unit, p.Location,
            p.CostPrice, p.SalePrice, p.Quantity, p.ReorderLevel, p.IsActive,
            p.Movements.Max(m => (DateTime?)m.OccurredAt)));

    private static ProductDto ToDto(Row r) => new(
        r.Id, r.Sku, r.Name, r.CategoryId, r.CategoryName, r.Unit, r.Location,
        r.CostPrice, r.SalePrice, r.Quantity, r.ReorderLevel, r.IsActive,
        r.Quantity * r.CostPrice,
        r.Quantity == 0 ? StockStatus.Out : r.Quantity <= r.ReorderLevel ? StockStatus.Low : StockStatus.Ok,
        r.LastMovementAt);

    /// <param name="status">ok | low | out</param>
    /// <param name="sort">name | sku | quantity | value | recent (prefix with - for descending)</param>
    [HttpGet]
    [Authorize(Policy = Permissions.ProductsView)]
    public async Task<PagedResult<ProductDto>> List(
        string? search, int? categoryId, string? status, bool includeInactive = false,
        string sort = "name", int page = 1, int pageSize = 20)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var q = db.Products.AsNoTracking();
        if (!includeInactive) q = q.Where(p => p.IsActive);
        if (categoryId is > 0) q = q.Where(p => p.CategoryId == categoryId);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim();
            q = q.Where(p => p.Name.Contains(s) || p.Sku.Contains(s) || (p.Location != null && p.Location.Contains(s)));
        }
        q = status?.ToLowerInvariant() switch
        {
            "out" => q.Where(p => p.Quantity == 0),
            "low" => q.Where(p => p.Quantity > 0 && p.Quantity <= p.ReorderLevel),
            "attention" => q.Where(p => p.Quantity <= p.ReorderLevel),
            "ok" => q.Where(p => p.Quantity > p.ReorderLevel),
            _ => q
        };

        var desc = sort.StartsWith('-');
        q = sort.TrimStart('-') switch
        {
            "sku" => desc ? q.OrderByDescending(p => p.Sku) : q.OrderBy(p => p.Sku),
            "quantity" => desc ? q.OrderByDescending(p => p.Quantity) : q.OrderBy(p => p.Quantity),
            "value" => desc ? q.OrderByDescending(p => p.Quantity * p.CostPrice) : q.OrderBy(p => p.Quantity * p.CostPrice),
            "recent" => desc ? q.OrderBy(p => p.Movements.Max(m => (DateTime?)m.OccurredAt))
                             : q.OrderByDescending(p => p.Movements.Max(m => (DateTime?)m.OccurredAt)),
            _ => desc ? q.OrderByDescending(p => p.Name) : q.OrderBy(p => p.Name),
        };

        var total = await q.CountAsync();
        var rows = await Project(q.Skip((page - 1) * pageSize).Take(pageSize)).ToListAsync();
        return new PagedResult<ProductDto>(rows.Select(ToDto).ToList(), total, page, pageSize);
    }

    [HttpGet("{id:int}")]
    [Authorize(Policy = Permissions.ProductsView)]
    public async Task<ProductDto> Get(int id)
    {
        var row = await Project(db.Products.AsNoTracking().Where(p => p.Id == id)).FirstOrDefaultAsync()
                  ?? throw AppException.NotFound("المنتج", "Product");
        return ToDto(row);
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
            p.Quantity = input.OpeningQuantity;
            db.StockMovements.Add(new StockMovement
            {
                Product = p,
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
        return await Get(p.Id);
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
        return await Get(id);
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
    }

    private static void Apply(Product p, ProductInput input)
    {
        p.Sku = input.Sku.Trim().ToUpperInvariant();
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
