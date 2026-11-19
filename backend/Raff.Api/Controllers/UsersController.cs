using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Raff.Api.Auth;
using Raff.Api.Data;
using Raff.Api.Domain;
using Raff.Api.Dtos;
using Raff.Api.Infrastructure;

namespace Raff.Api.Controllers;

[ApiController]
[Route("api/users")]
[Authorize(Policy = Permissions.UsersManage)]
public class UsersController(AppDbContext db, IPasswordHasher<User> hasher) : ControllerBase
{
    [HttpGet]
    public async Task<List<UserDto>> GetAll() =>
        await db.Users.AsNoTracking()
            .OrderByDescending(u => u.IsActive).ThenBy(u => u.FullName)
            .Select(u => new UserDto(u.Id, u.FullName, u.Username, u.RoleId, u.Role.Name, u.IsActive, u.CreatedAt, u.LastLoginAt,
                u.WarehouseId, u.Warehouse != null ? u.Warehouse.Name : null))
            .ToListAsync();

    [HttpPost]
    public async Task<UserDto> Create(UserCreate input)
    {
        var username = input.Username.Trim().ToLowerInvariant();
        if (await db.Users.AnyAsync(u => u.Username == username))
            throw AppException.Conflict(Msg.T("اسم المستخدم محجوز", "That username is taken"));
        var role = await db.Roles.FindAsync(input.RoleId) ?? throw AppException.NotFound("الدور", "Role");

        var warehouse = await WarehouseOrNull(input.WarehouseId);
        var user = new User { FullName = input.FullName.Trim(), Username = username, RoleId = role.Id, WarehouseId = warehouse?.Id };
        user.PasswordHash = hasher.HashPassword(user, input.Password);
        db.Users.Add(user);
        await db.SaveChangesAsync();

        return new UserDto(user.Id, user.FullName, user.Username, role.Id, role.Name, true, user.CreatedAt, null,
            warehouse?.Id, warehouse?.Name);
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, UserUpdate input)
    {
        var user = await db.Users.Include(u => u.Role).FirstOrDefaultAsync(u => u.Id == id)
                   ?? throw AppException.NotFound("المستخدم", "User");
        var role = await db.Roles.FindAsync(input.RoleId) ?? throw AppException.NotFound("الدور", "Role");

        // Never lock everyone out: the last active admin can't be demoted or deactivated.
        var losesAdmin = user.Role.IsSystem && user.IsActive && (!input.IsActive || !role.IsSystem);
        if (losesAdmin)
        {
            var otherAdmins = await db.Users.CountAsync(u => u.Id != id && u.IsActive && u.Role.IsSystem);
            if (otherAdmins == 0)
                throw AppException.Conflict(Msg.T("هذا آخر مدير نظام فعّال، لا يمكن إيقافه أو تغيير دوره", "This is the last active system admin; it can't be deactivated or demoted"));
        }
        if (id == User.GetUserId() && !input.IsActive)
            throw AppException.Conflict(Msg.T("لا يمكنك إيقاف حسابك بنفسك", "You can't deactivate your own account"));

        user.FullName = input.FullName.Trim();
        user.Role = role;
        user.IsActive = input.IsActive;
        user.WarehouseId = (await WarehouseOrNull(input.WarehouseId))?.Id;
        if (!string.IsNullOrWhiteSpace(input.NewPassword))
            user.PasswordHash = hasher.HashPassword(user, input.NewPassword);

        await db.SaveChangesAsync();
        return NoContent();
    }

    private async Task<Warehouse?> WarehouseOrNull(int? id)
    {
        if (id is not > 0) return null;
        var w = await db.Warehouses.FindAsync(id.Value) ?? throw AppException.NotFound("المستودع", "Warehouse");
        if (!w.IsActive) throw new AppException(Msg.T("المستودع المختار موقوف", "The selected warehouse is deactivated"));
        return w;
    }
}
