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
[Route("api/auth")]
public class AuthController(AppDbContext db, TokenService tokens, IPasswordHasher<User> hasher) : ControllerBase
{
    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<LoginResponse> Login(LoginRequest req)
    {
        var user = await db.Users
            .Include(u => u.Role).ThenInclude(r => r.Permissions)
            .Include(u => u.Warehouse)
            .FirstOrDefaultAsync(u => u.Username == req.Username.Trim());

        // Same message for unknown user and wrong password: don't reveal which usernames exist.
        var invalid = Msg.T("اسم المستخدم أو كلمة المرور غير صحيحة", "Wrong username or password");
        if (user is null) throw new AppException(invalid, StatusCodes.Status401Unauthorized);

        var check = hasher.VerifyHashedPassword(user, user.PasswordHash, req.Password);
        if (check == PasswordVerificationResult.Failed)
            throw new AppException(invalid, StatusCodes.Status401Unauthorized);
        if (!user.IsActive)
            throw new AppException(Msg.T("هذا الحساب موقوف، تواصل مع مدير النظام", "This account is deactivated. Contact a system admin"), StatusCodes.Status403Forbidden);

        if (check == PasswordVerificationResult.SuccessRehashNeeded)
            user.PasswordHash = hasher.HashPassword(user, req.Password);

        user.LastLoginAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        var perms = user.Role.Permissions.Select(p => p.Permission).ToList();
        var (token, expires) = tokens.CreateToken(user, perms);
        return new LoginResponse(token, expires,
            new CurrentUserDto(user.Id, user.FullName, user.Username, user.Role.Name, perms, user.WarehouseId, user.Warehouse?.Name));
    }

    /// <summary>Returns the signed-in user with permissions read fresh from the database.</summary>
    [HttpGet("me")]
    [Authorize]
    public async Task<CurrentUserDto> Me()
    {
        var id = User.GetUserId();
        var user = await db.Users.AsNoTracking()
            .Include(u => u.Role).ThenInclude(r => r.Permissions)
            .Include(u => u.Warehouse)
            .FirstOrDefaultAsync(u => u.Id == id && u.IsActive)
            ?? throw new AppException(Msg.T("انتهت الجلسة، سجّل الدخول من جديد", "Your session ended. Sign in again"), StatusCodes.Status401Unauthorized);

        return new CurrentUserDto(user.Id, user.FullName, user.Username, user.Role.Name,
            user.Role.Permissions.Select(p => p.Permission).ToList(), user.WarehouseId, user.Warehouse?.Name);
    }
}
