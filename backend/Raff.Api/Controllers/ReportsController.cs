using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Raff.Api.Auth;
using Raff.Api.Data;
using Raff.Api.Domain;
using Raff.Api.Dtos;

namespace Raff.Api.Controllers;

/// <summary>
/// Read-only aggregates for the dashboard and the reports page.
/// "tz" is the client's offset from UTC in minutes, so days are grouped in the user's local time.
/// </summary>
[ApiController]
[Authorize]
public class ReportsController(AppDbContext db) : ControllerBase
{
    // ---------------- Dashboard ----------------

    [HttpGet("api/dashboard/summary")]
    [Authorize(Policy = Permissions.DashboardView)]
    public async Task<DashboardSummary> Summary(int tz = 0, int? warehouseId = null)
    {
        var wid = User.ResolveWarehouse(warehouseId);

        // Stock value from the per-warehouse stock rows.
        var stock = (await db.StockLevels.AsNoTracking()
            .Where(s => s.Product.IsActive && (wid == null || s.WarehouseId == wid))
            .Select(s => new { s.Quantity, s.Product.CostPrice, s.Product.SalePrice })
            .GroupBy(_ => 1)
            .Select(g => new
            {
                Units = g.Sum(s => s.Quantity),
                Cost = g.Sum(s => s.Quantity * s.CostPrice),
                Sale = g.Sum(s => s.Quantity * s.SalePrice),
            })
            .ToListAsync()) // one aggregate row (or none); avoids a row-limiting query without ORDER BY (EF warning 10103)
            .FirstOrDefault();

        // Low / out-of-stock compares each product's quantity (in this warehouse, or in total) with its reorder level.
        var perProduct = await OnHand(wid).Select(x => new { x.Qty, x.ReorderLevel }).ToListAsync();

        var (todayStart, _) = LocalDayBounds(DateOnly.FromDateTime(DateTime.UtcNow.AddMinutes(tz)), tz);
        var now = DateTime.UtcNow;
        var moves = Moves(wid);
        var today = await moves.CountAsync(m => m.OccurredAt >= todayStart);
        var last30 = await Range(moves, now.AddDays(-30), now);
        var prev30 = await Range(moves, now.AddDays(-60), now.AddDays(-30));

        return new DashboardSummary(
            perProduct.Count, stock?.Units ?? 0, stock?.Cost ?? 0, stock?.Sale ?? 0,
            perProduct.Count(x => x.Qty > 0 && x.Qty <= x.ReorderLevel), perProduct.Count(x => x.Qty == 0),
            today, last30.Revenue, prev30.Revenue, last30.UnitsOut, last30.UnitsIn);
    }

    [HttpGet("api/dashboard/trend")]
    [Authorize(Policy = Permissions.DashboardView)]
    public Task<List<TrendPoint>> DashboardTrend(int days = 30, int tz = 0, int? warehouseId = null)
    {
        days = Math.Clamp(days, 7, 90);
        var to = DateOnly.FromDateTime(DateTime.UtcNow.AddMinutes(tz));
        return Trend(to.AddDays(-(days - 1)), to, tz, User.ResolveWarehouse(warehouseId));
    }

    [HttpGet("api/dashboard/low-stock")]
    [Authorize(Policy = Permissions.DashboardView)]
    public async Task<List<LowStockItem>> LowStock(int take = 8, int? warehouseId = null)
    {
        var rows = await OnHand(User.ResolveWarehouse(warehouseId))
            .Where(x => x.Qty <= x.ReorderLevel)
            .OrderBy(x => x.ReorderLevel == 0 ? 1.0 : (double)x.Qty / x.ReorderLevel)
            .ThenBy(x => x.Name)
            .Take(Math.Clamp(take, 1, 100))
            .ToListAsync();
        return rows.Select(x => new LowStockItem(x.Id, x.Sku, x.Name, x.Unit, x.Qty, x.ReorderLevel, x.Location)).ToList();
    }

    [HttpGet("api/dashboard/recent")]
    [Authorize(Policy = Permissions.DashboardView)]
    public async Task<List<MovementDto>> Recent(int take = 8, int? warehouseId = null) =>
        await MovementsController.Project(Moves(User.ResolveWarehouse(warehouseId))
                .OrderByDescending(m => m.OccurredAt).ThenByDescending(m => m.Id)
                .Take(Math.Clamp(take, 1, 50)))
            .ToListAsync();

    // ---------------- Reports ----------------

    [HttpGet("api/reports/summary")]
    [Authorize(Policy = Permissions.ReportsView)]
    public Task<RangeSummary> ReportSummary(DateOnly from, DateOnly to, int tz = 0, int? warehouseId = null)
    {
        var (start, _) = LocalDayBounds(from, tz);
        var (_, end) = LocalDayBounds(to, tz);
        return Range(Moves(User.ResolveWarehouse(warehouseId)), start, end);
    }

    [HttpGet("api/reports/trend")]
    [Authorize(Policy = Permissions.ReportsView)]
    public Task<List<TrendPoint>> ReportTrend(DateOnly from, DateOnly to, int tz = 0, int? warehouseId = null) =>
        Trend(from, to, tz, User.ResolveWarehouse(warehouseId));

    [HttpGet("api/reports/category-value")]
    [Authorize(Policy = Permissions.ReportsView)]
    public async Task<List<CategoryValuePoint>> CategoryValue(int? warehouseId = null)
    {
        var wid = User.ResolveWarehouse(warehouseId);
        // Project to an anonymous type first: EF Core can't ORDER BY a member of a record built through its constructor.
        var rows = await db.Categories.AsNoTracking()
            .Select(c => new
            {
                c.Id,
                c.Name,
                Value = c.Products.Where(p => p.IsActive).SelectMany(p => p.StockLevels)
                    .Where(s => wid == null || s.WarehouseId == wid).Sum(s => (decimal?)s.Quantity * s.Product.CostPrice) ?? 0,
                Units = c.Products.Where(p => p.IsActive).SelectMany(p => p.StockLevels)
                    .Where(s => wid == null || s.WarehouseId == wid).Sum(s => (int?)s.Quantity) ?? 0,
                Count = c.Products.Count(p => p.IsActive),
            })
            .OrderByDescending(x => x.Value)
            .ToListAsync();

        return rows.Select(r => new CategoryValuePoint(r.Id, r.Name, r.Value, r.Units, r.Count)).ToList();
    }

    [HttpGet("api/reports/top-products")]
    [Authorize(Policy = Permissions.ReportsView)]
    public async Task<List<TopProductPoint>> TopProducts(DateOnly from, DateOnly to, int tz = 0, int take = 10,
        string by = "revenue", int? warehouseId = null)
    {
        var (start, _) = LocalDayBounds(from, tz);
        var (_, end) = LocalDayBounds(to, tz);

        var grouped = Moves(User.ResolveWarehouse(warehouseId))
            .Where(m => m.Type == MovementType.Out && m.OccurredAt >= start && m.OccurredAt < end)
            .Select(m => new { m.ProductId, m.Product.Sku, m.Product.Name, m.Product.Unit, Units = -m.QuantityChange, m.UnitPrice })
            .GroupBy(m => new { m.ProductId, m.Sku, m.Name, m.Unit })
            .Select(g => new
            {
                g.Key.ProductId, g.Key.Sku, g.Key.Name, g.Key.Unit,
                Units = g.Sum(m => m.Units),
                Revenue = g.Sum(m => m.Units * m.UnitPrice),
            });

        // Order on the anonymous type (translatable), then map to the DTO in memory.
        grouped = by == "units" ? grouped.OrderByDescending(x => x.Units) : grouped.OrderByDescending(x => x.Revenue);
        var rows = await grouped.Take(Math.Clamp(take, 1, 50)).ToListAsync();
        return rows.Select(r => new TopProductPoint(r.ProductId, r.Sku, r.Name, r.Unit, r.Units, r.Revenue)).ToList();
    }

    // ---------------- helpers ----------------

    /// <summary>Movements, limited to one warehouse when one is chosen.</summary>
    private IQueryable<StockMovement> Moves(int? wid) =>
        wid is null ? db.StockMovements.AsNoTracking() : db.StockMovements.AsNoTracking().Where(m => m.WarehouseId == wid);

    private sealed class ProductQty
    {
        public int Id { get; init; }
        public string Sku { get; init; } = "";
        public string Name { get; init; } = "";
        public string Unit { get; init; } = "";
        public string? Location { get; init; }
        public int ReorderLevel { get; init; }
        public int Qty { get; init; }
    }

    /// <summary>Each active product with its on-hand quantity in one warehouse (or in total).</summary>
    private IQueryable<ProductQty> OnHand(int? wid) =>
        db.Products.AsNoTracking().Where(p => p.IsActive).Select(p => new ProductQty
        {
            Id = p.Id, Sku = p.Sku, Name = p.Name, Unit = p.Unit, Location = p.Location, ReorderLevel = p.ReorderLevel,
            Qty = p.StockLevels.Where(s => wid == null || s.WarehouseId == wid).Sum(s => (int?)s.Quantity) ?? 0,
        });

    /// <summary>UTC [start, end) of a calendar day in the user's local time.</summary>
    private static (DateTime Start, DateTime End) LocalDayBounds(DateOnly day, int tz)
    {
        var start = day.ToDateTime(TimeOnly.MinValue).AddMinutes(-tz);
        return (start, start.AddDays(1));
    }

    private static async Task<RangeSummary> Range(IQueryable<StockMovement> q, DateTime start, DateTime end)
    {
        var r = (await q.Where(m => m.OccurredAt >= start && m.OccurredAt < end)
            .Select(m => new { m.Type, m.QuantityChange, m.UnitPrice, Cost = m.Product.CostPrice })
            .GroupBy(_ => 1)
            .Select(g => new RangeSummary(
                g.Count(),
                g.Sum(m => m.Type == MovementType.In ? m.QuantityChange : 0),
                g.Sum(m => m.Type == MovementType.Out ? -m.QuantityChange : 0),
                g.Sum(m => m.Type == MovementType.In ? m.QuantityChange * m.UnitPrice : 0m),
                g.Sum(m => m.Type == MovementType.Out ? -m.QuantityChange * m.UnitPrice : 0m),
                g.Sum(m => m.Type == MovementType.Out ? -m.QuantityChange * (m.UnitPrice - m.Cost) : 0m)))
            .ToListAsync()) // one aggregate row (or none); avoids a row-limiting query without ORDER BY (EF warning 10103)
            .FirstOrDefault();
        return r ?? new RangeSummary(0, 0, 0, 0, 0, 0);
    }

    private async Task<List<TrendPoint>> Trend(DateOnly from, DateOnly to, int tz, int? wid)
    {
        if (to < from) (from, to) = (to, from);
        if (to.DayNumber - from.DayNumber > 366) from = to.AddDays(-366);

        var (start, _) = LocalDayBounds(from, tz);
        var (_, end) = LocalDayBounds(to, tz);

        // Purchases and sales only: adjustments and transfers between warehouses aren't trade.
        var rows = await Moves(wid)
            .Where(m => m.OccurredAt >= start && m.OccurredAt < end && (m.Type == MovementType.In || m.Type == MovementType.Out))
            .GroupBy(m => m.OccurredAt.AddMinutes(tz).Date)
            .Select(g => new
            {
                Day = g.Key,
                UnitsIn = g.Sum(m => m.Type == MovementType.In ? m.QuantityChange : 0),
                UnitsOut = g.Sum(m => m.Type == MovementType.Out ? -m.QuantityChange : 0),
                ValueIn = g.Sum(m => m.Type == MovementType.In ? m.QuantityChange * m.UnitPrice : 0m),
                ValueOut = g.Sum(m => m.Type == MovementType.Out ? -m.QuantityChange * m.UnitPrice : 0m),
            })
            .ToListAsync();

        var byDay = rows.ToDictionary(r => DateOnly.FromDateTime(r.Day));
        var result = new List<TrendPoint>();
        for (var d = from; d <= to; d = d.AddDays(1))
        {
            result.Add(byDay.TryGetValue(d, out var r)
                ? new TrendPoint(d, r.UnitsIn, r.UnitsOut, r.ValueIn, r.ValueOut)
                : new TrendPoint(d, 0, 0, 0, 0));
        }
        return result;
    }
}
