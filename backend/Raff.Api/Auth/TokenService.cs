using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Raff.Api.Domain;

namespace Raff.Api.Auth;

public class JwtOptions
{
    public string Issuer { get; set; } = string.Empty;
    public string Audience { get; set; } = string.Empty;
    public string Key { get; set; } = string.Empty;
    public int ExpiresHours { get; set; } = 8;
}

public class TokenService(IOptions<JwtOptions> options)
{
    private readonly JwtOptions _opt = options.Value;

    public (string Token, DateTime ExpiresAt) CreateToken(User user, IEnumerable<string> permissions)
    {
        var claims = new List<Claim>
        {
            new("sub", user.Id.ToString()),
            new("username", user.Username),
            new("name", user.FullName),
            new("role", user.Role.Name),
        };
        claims.AddRange(permissions.Select(p => new Claim(Permissions.ClaimType, p)));
        if (user.WarehouseId is { } wh)
            claims.Add(new Claim(Permissions.WarehouseClaim, wh.ToString()));

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_opt.Key));
        var expires = DateTime.UtcNow.AddHours(_opt.ExpiresHours);

        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = _opt.Issuer,
            Audience = _opt.Audience,
            Subject = new ClaimsIdentity(claims),
            Expires = expires,
            SigningCredentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256),
        };

        return (new JsonWebTokenHandler().CreateToken(descriptor), expires);
    }
}

public static class ClaimsPrincipalExtensions
{
    public static int GetUserId(this ClaimsPrincipal user)
    {
        var sub = user.FindFirstValue("sub")
                  ?? user.FindFirstValue(ClaimTypes.NameIdentifier);
        return int.TryParse(sub, out var id) ? id : throw new UnauthorizedAccessException();
    }

    /// <summary>The single warehouse this user is limited to, or null when they may see all warehouses.</summary>
    public static int? WarehouseScope(this ClaimsPrincipal user) =>
        int.TryParse(user.FindFirstValue(Permissions.WarehouseClaim), out var wh) ? wh : null;

    /// <summary>
    /// Applies the user's warehouse limit to a requested warehouse filter:
    /// unrestricted users get what they asked for (null = all); restricted users always get their own
    /// warehouse, and asking for a different one is refused.
    /// </summary>
    public static int? ResolveWarehouse(this ClaimsPrincipal user, int? requested)
    {
        var scope = user.WarehouseScope();
        if (scope is null) return requested is > 0 ? requested : null;
        if (requested is > 0 && requested != scope)
            throw new Infrastructure.AppException(
                Infrastructure.Msg.T("لا تملك صلاحية على هذا المستودع", "You don't have access to this warehouse"),
                StatusCodes.Status403Forbidden);
        return scope;
    }
}
