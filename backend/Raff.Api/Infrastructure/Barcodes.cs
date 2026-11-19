namespace Raff.Api.Infrastructure;

/// <summary>GS1 barcode helpers (EAN-8, UPC-A, EAN-13 and GTIN-14 share one mod-10 check digit).</summary>
public static class Barcodes
{
    /// <summary>True when the code is all digits and as long as a GS1 barcode, so its last digit is a check digit.</summary>
    public static bool IsGtin(string code) =>
        code.Length is 8 or 12 or 13 or 14 && code.All(char.IsAsciiDigit);

    /// <summary>The check digit for the digits before it (weights 3,1,3,… from the right).</summary>
    public static int CheckDigit(ReadOnlySpan<char> body)
    {
        var sum = 0;
        for (var i = 0; i < body.Length; i++)
        {
            var digit = body[body.Length - 1 - i] - '0';
            sum += i % 2 == 0 ? digit * 3 : digit;
        }
        return (10 - sum % 10) % 10;
    }

    public static bool HasValidCheckDigit(string gtin) =>
        CheckDigit(gtin.AsSpan(0, gtin.Length - 1)) == gtin[^1] - '0';

    /// <summary>Appends the check digit, e.g. 621000000001 becomes the EAN-13 6210000000014.</summary>
    public static string WithCheckDigit(string body) => body + CheckDigit(body);
}
