using System.Globalization;

namespace Raff.Api.Infrastructure;

/// <summary>
/// Picks the user-facing message language from the request culture (set from Accept-Language
/// by UseRequestLocalization). Arabic is the default; English is used when the client asks for it.
/// </summary>
public static class Msg
{
    public static bool IsEnglish => CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "en";

    public static string T(string ar, string en) => IsEnglish ? en : ar;
}
