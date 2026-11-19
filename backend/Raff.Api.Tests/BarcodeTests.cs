using System.Net;
using System.Net.Http.Json;
using Raff.Api.Dtos;
using Raff.Api.Infrastructure;

namespace Raff.Api.Tests;

[Collection("api")]
public class BarcodeTests(ApiFixture api)
{
    [Theory]
    [InlineData("4006381333931", true)]  // EAN-13
    [InlineData("036000291452", true)]   // UPC-A
    [InlineData("96385074", true)]       // EAN-8
    [InlineData("4006381333932", false)] // last digit mistyped
    public void Gs1_check_digit_is_verified(string code, bool valid)
    {
        Assert.True(Barcodes.IsGtin(code));
        Assert.Equal(valid, Barcodes.HasValidCheckDigit(code));
    }

    [Fact]
    public async Task A_scanned_barcode_or_sku_finds_the_product_with_its_stock()
    {
        var admin = await api.ClientFor("admin");
        var cat = await TestData.CreateCategory(admin);
        var ean = TestData.UniqueEan13();
        var product = await TestData.CreateProduct(admin, cat.Id, openingQuantity: 9, barcode: ean);

        var byBarcode = await admin.GetFromJsonAsync<ProductDto>($"/api/products/lookup?code={ean}", ApiFixture.Json);
        var bySku = await admin.GetFromJsonAsync<ProductDto>($"/api/products/lookup?code={product.Sku.ToLowerInvariant()}", ApiFixture.Json);

        Assert.Equal(product.Id, byBarcode!.Id);
        Assert.Equal(9, byBarcode.Quantity);
        Assert.Equal(ean, byBarcode.Barcode);
        Assert.Equal(product.Id, bySku!.Id);
    }

    [Fact]
    public async Task An_unknown_code_returns_not_found_with_a_readable_message()
    {
        var admin = await api.ClientFor("admin", "en");

        var res = await admin.GetAsync("/api/products/lookup?code=NOPE-0000");

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
        Assert.Equal("No product has the code NOPE-0000", await TestData.ErrorTitle(res));
    }

    [Fact]
    public async Task A_barcode_with_a_wrong_check_digit_is_rejected()
    {
        var admin = await api.ClientFor("admin");
        var cat = await TestData.CreateCategory(admin);
        var ean = TestData.UniqueEan13();
        var wrong = ean[..^1] + (char)('0' + (ean[^1] - '0' + 1) % 10);

        var res = await admin.PostAsJsonAsync("/api/products",
            new ProductInput(TestData.Unique("T-").ToUpperInvariant(), "Bad barcode", cat.Id, "pcs", null, 1, 2, 1, Barcode: wrong),
            ApiFixture.Json);

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Two_products_cannot_share_a_barcode()
    {
        var admin = await api.ClientFor("admin");
        var cat = await TestData.CreateCategory(admin);
        var ean = TestData.UniqueEan13();
        await TestData.CreateProduct(admin, cat.Id, barcode: ean);

        var res = await admin.PostAsJsonAsync("/api/products",
            new ProductInput(TestData.Unique("T-").ToUpperInvariant(), "Copy", cat.Id, "pcs", null, 1, 2, 1, Barcode: ean),
            ApiFixture.Json);

        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
    }

    [Fact]
    public async Task Searching_the_product_list_by_barcode_finds_it()
    {
        var admin = await api.ClientFor("admin");
        var cat = await TestData.CreateCategory(admin);
        var ean = TestData.UniqueEan13();
        var product = await TestData.CreateProduct(admin, cat.Id, barcode: ean);

        var page = await admin.GetFromJsonAsync<PagedResult<ProductDto>>($"/api/products?search={ean}", ApiFixture.Json);

        Assert.Equal(product.Id, Assert.Single(page!.Items).Id);
    }
}
