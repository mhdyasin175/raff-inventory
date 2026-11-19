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
[Route("api/warehouses")]
[Authorize]
public class WarehousesController(AppDbContext db) : ControllerBase
{
    /// <summary>
    /// Every signed-in user can list warehouses (the app needs them for filters and forms).
    /// Users limited to one warehouse only get that one.
    /// </summary>
    [HttpGet]
    public async Task<List<WarehouseDto>> GetAll(bool includeInactive = false)
    {
        var scope = User.WarehouseScope();
        var q = db.Warehouses.AsNoTracking();
        if (scope is not null) q = q.Where(w => w.Id == scope);
        else if (!includeInactive) q = q.Where(w => w.IsActive);

        var rows = await q
            .OrderBy(w => w.Id)
            .Select(w => new
            {
                w.Id, w.Code, w.Name, w.Address, w.IsActive,
                Products = w.StockLevels.Count(s => s.Quantity > 0 && s.Product.IsActive),
                Units = w.StockLevels.Where(s => s.Product.IsActive).Sum(s => (int?)s.Quantity) ?? 0,
                Value = w.StockLevels.Where(s => s.Product.IsActive).Sum(s => (decimal?)s.Quantity * s.Product.CostPrice) ?? 0,
                Users = db.Users.Count(u => u.WarehouseId == w.Id && u.IsActive),
            })
            .ToListAsync();

        return rows.Select(r => new WarehouseDto(r.Id, r.Code, r.Name, r.Address, r.IsActive, r.Products, r.Units, r.Value, r.Users)).ToList();
    }

    /// <summary>
    /// Id, code and name of every active warehouse: the destinations a user can transfer stock to,
    /// including users limited to their own warehouse.
    /// </summary>
    [HttpGet("options")]
    public async Task<List<WarehouseOption>> Options() =>
        await db.Warehouses.AsNoTracking().Where(w => w.IsActive).OrderBy(w => w.Id)
            .Select(w => new WarehouseOption(w.Id, w.Code, w.Name))
            .ToListAsync();

    [HttpPost]
    [Authorize(Policy = Permissions.WarehousesManage)]
    public async Task<WarehouseDto> Create(WarehouseInput input)
    {
        var (code, name) = await ValidateAsync(input, null);
        var w = new Warehouse { Code = code, Name = name, Address = input.Address?.Trim(), IsActive = true };
        db.Warehouses.Add(w);
        await db.SaveChangesAsync();
        return new WarehouseDto(w.Id, w.Code, w.Name, w.Address, true, 0, 0, 0, 0);
    }

    [HttpPut("{id:int}")]
    [Authorize(Policy = Permissions.WarehousesManage)]
    public async Task<IActionResult> Update(int id, WarehouseInput input)
    {
        var w = await db.Warehouses.FindAsync(id) ?? throw AppException.NotFound("المستودع", "Warehouse");
        var (code, name) = await ValidateAsync(input, id);

        if (w.IsActive && !input.IsActive)
            await EnsureCanDeactivate(w);

        w.Code = code;
        w.Name = name;
        w.Address = input.Address?.Trim();
        w.IsActive = input.IsActive;
        await db.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>Deletes an unused warehouse; one with history is deactivated instead so its records stay intact.</summary>
    [HttpDelete("{id:int}")]
    [Authorize(Policy = Permissions.WarehousesManage)]
    public async Task<object> Delete(int id)
    {
        var w = await db.Warehouses.FindAsync(id) ?? throw AppException.NotFound("المستودع", "Warehouse");
        await EnsureCanDeactivate(w);

        var hasHistory = await db.StockMovements.AnyAsync(m => m.WarehouseId == id || m.CounterpartWarehouseId == id)
                         || await db.Users.AnyAsync(u => u.WarehouseId == id);
        if (hasHistory) w.IsActive = false;
        else
        {
            db.StockLevels.RemoveRange(db.StockLevels.Where(s => s.WarehouseId == id));
            db.Warehouses.Remove(w);
        }
        await db.SaveChangesAsync();
        return new { archived = hasHistory };
    }

    private async Task EnsureCanDeactivate(Warehouse w)
    {
        if (await db.StockLevels.AnyAsync(s => s.WarehouseId == w.Id && s.Quantity > 0))
            throw AppException.Conflict(Msg.T(
                $"في {w.Name} بضاعة. انقلها لمستودع آخر قبل إيقافه",
                $"{w.Name} still holds stock. Transfer it to another warehouse first"));
        if (await db.Warehouses.CountAsync(x => x.IsActive && x.Id != w.Id) == 0)
            throw AppException.Conflict(Msg.T("لا بد من مستودع فعّال واحد على الأقل", "At least one warehouse must stay active"));
    }

    private async Task<(string Code, string Name)> ValidateAsync(WarehouseInput input, int? id)
    {
        var code = input.Code.Trim().ToUpperInvariant();
        var name = input.Name.Trim();
        if (await db.Warehouses.AnyAsync(w => w.Code == code && w.Id != id))
            throw AppException.Conflict(Msg.T($"الرمز {code} مستخدم لمستودع آخر", $"Code {code} is used by another warehouse"));
        if (await db.Warehouses.AnyAsync(w => w.Name == name && w.Id != id))
            throw AppException.Conflict(Msg.T("يوجد مستودع بنفس الاسم", "A warehouse with this name already exists"));
        return (code, name);
    }
}
