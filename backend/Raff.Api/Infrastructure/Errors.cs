using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace Raff.Api.Infrastructure;

/// <summary>A business-rule failure whose message is safe to show to the user.</summary>
public class AppException(string message, int statusCode = StatusCodes.Status400BadRequest) : Exception(message)
{
    public int StatusCode { get; } = statusCode;

    public static AppException NotFound(string whatAr, string whatEn) =>
        new(Msg.T($"{whatAr} غير موجود", $"{whatEn} not found"), StatusCodes.Status404NotFound);
    public static AppException Conflict(string message) => new(message, StatusCodes.Status409Conflict);
}

/// <summary>Turns every exception into an RFC 7807 problem response with an Arabic, user-facing title.</summary>
public class GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext ctx, Exception ex, CancellationToken ct)
    {
        // Read the language from the request itself: by the time an exception reaches this
        // handler, the culture set by the localization middleware may no longer be in effect.
        var en = ctx.Request.Headers.AcceptLanguage.ToString().StartsWith("en", StringComparison.OrdinalIgnoreCase);

        var (status, title) = ex switch
        {
            AppException app => (app.StatusCode, app.Message),
            UnauthorizedAccessException => (StatusCodes.Status401Unauthorized, en ? "Sign in to continue" : "يجب تسجيل الدخول"),
            _ => (StatusCodes.Status500InternalServerError, en ? "Something went wrong on the server" : "حدث خطأ غير متوقع في الخادم"),
        };

        if (status >= 500) logger.LogError(ex, "Unhandled exception");

        ctx.Response.StatusCode = status;
        await ctx.Response.WriteAsJsonAsync(new ProblemDetails { Status = status, Title = title }, ct);
        return true;
    }
}
