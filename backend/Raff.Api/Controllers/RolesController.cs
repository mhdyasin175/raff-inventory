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
[Route("api/roles")]
[Authorize]
public class RolesController(AppDbContext db) : ControllerBase
{
    /// <summary>Roles are listed for anyone who manages users (to pick a role) or roles.</summary>
    [HttpGet]
    public async Task<ActionResult<List<RoleDto>>> GetAll()
    {
        if (!User.HasClaim(Permissions.ClaimType, Permissions.RolesManage) &&
            !User.HasClaim(Permissions.ClaimType, Permissions.UsersManage))
            return Forbid();

        var roles = await db.Roles.AsNoTracking()
            .OrderByDescending(r => r.IsSystem).ThenBy(r => r.Id)
            .Select(r => new
            {
                r.Id, r.Name, r.Description, r.IsSystem,
                Users = r.Users.Count,
                Perms = r.Permissions.Select(p => p.Permission).ToList()
            })
            .ToListAsync();

        return roles.Select(r => new RoleDto(r.Id, r.Name, r.Description, r.IsSystem, r.Users, r.Perms)).ToList();
    }

    [HttpGet("permissions")]
    [Authorize(Policy = Permissions.RolesManage)]
    public IEnumerable<PermissionDto> AllPermissions() =>
        Permissions.All.Select(p => new PermissionDto(p.Key, p.Group, p.Label));

    [HttpPost]
    [Authorize(Policy = Permissions.RolesManage)]
    public async Task<RoleDto> Create(RoleInput input)
    {
        var name = input.Name.Trim();
        if (await db.Roles.AnyAsync(r => r.Name == name)) throw AppException.Conflict(Msg.T("يوجد دور بنفس الاسم", "A role with this name already exists"));

        var role = new Role { Name = name, Description = input.Description?.Trim() };
        SetPermissions(role, input.Permissions);
        db.Roles.Add(role);
        await db.SaveChangesAsync();
        return new RoleDto(role.Id, role.Name, role.Description, false, 0, role.Permissions.Select(p => p.Permission).ToList());
    }

    [HttpPut("{id:int}")]
    [Authorize(Policy = Permissions.RolesManage)]
    public async Task<IActionResult> Update(int id, RoleInput input)
    {
        var role = await db.Roles.Include(r => r.Permissions).FirstOrDefaultAsync(r => r.Id == id)
                   ?? throw AppException.NotFound("الدور", "Role");
        var name = input.Name.Trim();
        if (await db.Roles.AnyAsync(r => r.Name == name && r.Id != id)) throw AppException.Conflict(Msg.T("يوجد دور بنفس الاسم", "A role with this name already exists"));

        role.Name = name;
        role.Description = input.Description?.Trim();
        if (role.IsSystem)
        {
            // The system admin role always keeps every permission.
            if (!Permissions.Keys.All(input.Permissions.Contains))
                throw AppException.Conflict(Msg.T("دور مدير النظام يملك كل الصلاحيات دائماً ولا يمكن تقييده", "The system admin role always has every permission"));
        }
        else
        {
            // Diff instead of delete-all/insert-all: re-adding an identical composite key
            // in the same context would clash with the entry being deleted.
            var wanted = Validate(input.Permissions);
            var current = role.Permissions.Select(p => p.Permission).ToHashSet();
            db.RolePermissions.RemoveRange(role.Permissions.Where(p => !wanted.Contains(p.Permission)).ToList());
            foreach (var p in wanted.Where(p => !current.Contains(p)))
                role.Permissions.Add(new RolePermission { Permission = p });
        }

        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id:int}")]
    [Authorize(Policy = Permissions.RolesManage)]
    public async Task<IActionResult> Delete(int id)
    {
        var role = await db.Roles.FindAsync(id) ?? throw AppException.NotFound("الدور", "Role");
        if (role.IsSystem) throw AppException.Conflict(Msg.T("لا يمكن حذف دور النظام", "The system role can't be deleted"));
        if (await db.Users.AnyAsync(u => u.RoleId == id))
            throw AppException.Conflict(Msg.T("هذا الدور مسند لمستخدمين. انقلهم لدور آخر أولاً", "This role is assigned to users. Move them to another role first"));

        db.Roles.Remove(role);
        await db.SaveChangesAsync();
        return NoContent();
    }

    private static HashSet<string> Validate(IEnumerable<string>? perms)
    {
        var set = (perms ?? []).ToHashSet();
        var unknown = set.Where(p => !Permissions.Keys.Contains(p)).ToList();
        if (unknown.Count > 0) throw new AppException(Msg.T("صلاحيات غير معروفة: ", "Unknown permissions: ") + string.Join(", ", unknown));
        return set;
    }

    private static void SetPermissions(Role role, IEnumerable<string>? perms)
    {
        foreach (var p in Validate(perms))
            role.Permissions.Add(new RolePermission { Permission = p });
    }
}
