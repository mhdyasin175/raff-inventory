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
    public async Task<DashboardSummary> Summary(int tz = 0)
    {
        var products = db.Products.AsNoTracking().Where(p => p.IsActive);
        var stock = (await products
            .GroupBy(_ => 1)
            .Select(g => new
            {
                Count = g.Count(),
                Units = g.Sum(p => p.Quantity),
                Cost = g.Sum(p => p.Quantity * p.CostPrice),
                Sale = g.Sum(p => p.Quantity * p.SalePrice),
                Low = g.Count(p => p.Quantity > 0 && p.Quantity <= p.ReorderLevel),
                Out = g.Count(p => p.Quantity == 0),
            })
            .ToListAsync()) // one aggregate row (or none); avoids a row-limiting query without ORDER BY (EF warning 10103)
            .FirstOrDefault();

        var (todayStart, _) = LocalDayBounds(DateOnly.FromDateTime(DateTime.UtcNow.AddMinutes(tz)), tz);
        var now = DateTime.UtcNow;
        var d30 = now.AddDays(-30);
        var d60 = now.AddDays(-60);

        var moves = db.StockMovements.AsNoTracking();
        var today = await moves.CountAsync(m => m.OccurredAt >= todayStart);
        var last30 = await Range(moves, d30, now);
        var prev30 = await Range(moves, d60, d30);

        return new DashboardSummary(
            stock?.Count ?? 0, stock?.Units ?? 0, stock?.Cost ?? 0, stock?.Sale ?? 0,
            stock?.Low ?? 0, stock?.Out ?? 0,
            today, last30.Revenue, prev30.Revenue, last30.UnitsOut, last30.UnitsIn);
    }

    [HttpGet("api/dashboard/trend")]
    [Authorize(Policy = Permissions.DashboardView)]
    public Task<List<TrendPoint>> DashboardTrend(int days = 30, int tz = 0)
    {
        days = Math.Clamp(days, 7, 90);
        var to = DateOnly.FromDateTime(DateTime.UtcNow.AddMinutes(tz));
        return Trend(to.AddDays(-(days - 1)), to, tz);
    }

    [HttpGet("api/dashboard/low-stock")]
    [Authorize(Policy = Permissions.DashboardView)]
    public async Task<List<LowStockItem>> LowStock(int take = 8) =>
        await db.Products.AsNoTracking()
            .Where(p => p.IsActive && p.Quantity <= p.ReorderLevel)
            .OrderBy(p => p.ReorderLevel == 0 ? 1.0 : (double)p.Quantity / p.ReorderLevel)
            .ThenBy(p => p.Name)
            .Take(Math.Clamp(take, 1, 100))
            .Select(p => new LowStockItem(p.Id, p.Sku, p.Name, p.Unit, p.Quantity, p.ReorderLevel, p.Location))
            .ToListAsync();

    [HttpGet("api/dashboard/recent")]
    [Authorize(Policy = Permissions.DashboardView)]
    public async Task<List<MovementDto>> Recent(int take = 8) =>
        await db.StockMovements.AsNoTracking()
            .OrderByDescending(m => m.OccurredAt).ThenByDescending(m => m.Id)
            .Take(Math.Clamp(take, 1, 50))
            .Select(m => new MovementDto(m.Id, m.ProductId, m.Product.Name, m.Product.Sku, m.Product.Unit, m.Type,
                m.QuantityChange, m.BalanceAfter, m.UnitPrice, Math.Abs(m.QuantityChange) * m.UnitPrice,
                m.Party, m.Reference, m.Note, m.OccurredAt, m.CreatedBy.FullName))
            .ToListAsync();

    // ---------------- Reports ----------------

    [HttpGet("api/reports/summary")]
    [Authorize(Policy = Permissions.ReportsView)]
    public Task<RangeSummary> ReportSummary(DateOnly from, DateOnly to, int tz = 0)
    {
        var (start, _) = LocalDayBounds(from, tz);
        var (_, end) = LocalDayBounds(to, tz);
        return Range(db.StockMovements.AsNoTracking(), start, end);
    }

    [HttpGet("api/reports/trend")]
    [Authorize(Policy = Permissions.ReportsView)]
    public Task<List<TrendPoint>> ReportTrend(DateOnly from, DateOnly to, int tz = 0) => Trend(from, to, tz);

    [HttpGet("api/reports/category-value")]
    [Authorize(Policy = Permissions.ReportsView)]
    public async Task<List<CategoryValuePoint>> CategoryValue()
    {
        // Project to an anonymous type first: EF Core can't ORDER BY a member of a record built through its constructor.
        var rows = await db.Categories.AsNoTracking()
            .Select(c => new
            {
                c.Id,
                c.Name,
                Value = c.Products.Where(p => p.IsActive).Sum(p => (decimal?)p.Quantity * p.CostPrice) ?? 0,
                Units = c.Products.Where(p => p.IsActive).Sum(p => (int?)p.Quantity) ?? 0,
                Count = c.Products.Count(p => p.IsActive),
            })
            .OrderByDescending(x => x.Value)
            .ToListAsync();

        return rows.Select(r => new CategoryValuePoint(r.Id, r.Name, r.Value, r.Units, r.Count)).ToList();
    }

    [HttpGet("api/reports/top-products")]
    [Authorize(Policy = Permissions.ReportsView)]
    public async Task<List<TopProductPoint>> TopProducts(DateOnly from, DateOnly to, int tz = 0, int take = 10, string by = "revenue")
    {
        var (start, _) = LocalDayBounds(from, tz);
        var (_, end) = LocalDayBounds(to, tz);

        var grouped = db.StockMovements.AsNoTracking()
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

    private async Task<List<TrendPoint>> Trend(DateOnly from, DateOnly to, int tz)
    {
        if (to < from) (from, to) = (to, from);
        if (to.DayNumber - from.DayNumber > 366) from = to.AddDays(-366);

        var (start, _) = LocalDayBounds(from, tz);
        var (_, end) = LocalDayBounds(to, tz);

        var rows = await db.StockMovements.AsNoTracking()
            .Where(m => m.OccurredAt >= start && m.OccurredAt < end && m.Type != MovementType.Adjustment)
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
