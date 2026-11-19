using System.Net;
using System.Net.Http.Json;
using Raff.Api.Domain;
using Raff.Api.Dtos;

namespace Raff.Api.Tests;

[Collection("api")]
public class ReportTests(ApiFixture api)
{
    private static string Today => DateTime.UtcNow.ToString("yyyy-MM-dd");

    [Fact]
    public async Task Category_value_sums_quantity_times_cost_for_active_products()
    {
        var admin = await api.ClientFor("admin");
        var cat = await TestData.CreateCategory(admin);
        await TestData.CreateProduct(admin, cat.Id, openingQuantity: 10, cost: 2.5m);
        await TestData.CreateProduct(admin, cat.Id, openingQuantity: 4, cost: 10m);
        var archived = await TestData.CreateProduct(admin, cat.Id, openingQuantity: 100, cost: 1m);
        await admin.DeleteAsync($"/api/products/{archived.Id}");

        var res = await admin.GetAsync("/api/reports/category-value");

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var rows = (await res.Content.ReadFromJsonAsync<List<CategoryValuePoint>>(ApiFixture.Json))!;
        var mine = rows.Single(r => r.CategoryId == cat.Id);
        Assert.Equal(65m, mine.StockValue); // 10×2.5 + 4×10, archived product excluded
        Assert.Equal(14, mine.Units);
        Assert.Equal(2, mine.Products);
        Assert.Equal(rows.OrderByDescending(r => r.StockValue).Select(r => r.CategoryId), rows.Select(r => r.CategoryId));
    }

    [Theory]
    [InlineData("revenue")]
    [InlineData("units")]
    public async Task Top_products_counts_only_stock_out_and_is_sorted(string by)
    {
        var admin = await api.ClientFor("admin");
        var cat = await TestData.CreateCategory(admin);
        var product = await TestData.CreateProduct(admin, cat.Id, openingQuantity: 50);
        await TestData.Move(admin, product.Id, MovementType.Out, 7, unitPrice: 4m);
        await TestData.Move(admin, product.Id, MovementType.Out, 3, unitPrice: 5m);

        var res = await admin.GetAsync($"/api/reports/top-products?from={Today}&to={Today}&tz=0&take=50&by={by}");

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var rows = (await res.Content.ReadFromJsonAsync<List<TopProductPoint>>(ApiFixture.Json))!;
        var mine = rows.Single(r => r.ProductId == product.Id);
        Assert.Equal(10, mine.UnitsOut);
        Assert.Equal(43m, mine.Revenue); // 7×4 + 3×5

        var keys = rows.Select(r => by == "units" ? r.UnitsOut : r.Revenue).ToList();
        Assert.Equal(keys.OrderByDescending(k => k), keys);
    }

    [Fact]
    public async Task Period_summary_includes_revenue_and_gross_profit()
    {
        var admin = await api.ClientFor("admin");
        var before = (await admin.GetFromJsonAsync<RangeSummary>($"/api/reports/summary?from={Today}&to={Today}&tz=0", ApiFixture.Json))!;

        var cat = await TestData.CreateCategory(admin);
        var product = await TestData.CreateProduct(admin, cat.Id, openingQuantity: 10, cost: 2m, sale: 5m);
        await TestData.Move(admin, product.Id, MovementType.Out, 4); // sold at the default sale price

        var after = (await admin.GetFromJsonAsync<RangeSummary>($"/api/reports/summary?from={Today}&to={Today}&tz=0", ApiFixture.Json))!;

        Assert.Equal(20m, after.Revenue - before.Revenue);        // 4 × 5
        Assert.Equal(12m, after.GrossProfit - before.GrossProfit); // 4 × (5 − 2)
        Assert.Equal(4, after.UnitsOut - before.UnitsOut);
        Assert.Equal(10, after.UnitsIn - before.UnitsIn);
    }

    [Fact]
    public async Task Daily_trend_returns_one_point_per_day_including_empty_days()
    {
        var admin = await api.ClientFor("admin");
        var from = DateTime.UtcNow.AddDays(-6).ToString("yyyy-MM-dd");

        var points = (await admin.GetFromJsonAsync<List<TrendPoint>>($"/api/reports/trend?from={from}&to={Today}&tz=0", ApiFixture.Json))!;

        Assert.Equal(7, points.Count);
        Assert.Equal(DateOnly.Parse(Today), points[^1].Date);
    }

    [Fact]
    public async Task Dashboard_endpoints_respond_for_every_role_that_has_a_dashboard()
    {
        foreach (var user in new[] { "admin", "manager", "keeper", "viewer" })
        {
            var client = await api.ClientFor(user);
            foreach (var url in new[] { "/api/dashboard/summary?tz=180", "/api/dashboard/trend?days=30&tz=180",
                                        "/api/dashboard/low-stock", "/api/dashboard/recent" })
            {
                var res = await client.GetAsync(url);
                Assert.True(res.StatusCode == HttpStatusCode.OK, $"{user} → {url} returned {(int)res.StatusCode}");
            }
        }
    }

    [Fact]
    public async Task Csv_export_starts_with_a_byte_order_mark_and_localized_headers()
    {
        var admin = await api.ClientFor("admin", language: "en");

        var bytes = await admin.GetByteArrayAsync($"/api/movements/export?from={Today}&to={Today}&tz=0");

        Assert.Equal(new byte[] { 0xEF, 0xBB, 0xBF }, bytes[..3]);
        Assert.StartsWith("Date,Type,Code,Product", System.Text.Encoding.UTF8.GetString(bytes[3..]));
    }

    [Fact]
    public async Task Not_found_messages_follow_the_request_language()
    {
        var en = await api.ClientFor("admin", language: "en");

        var res = await en.GetAsync("/api/products/999999");

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
        Assert.Equal("Product not found", await TestData.ErrorTitle(res));
    }
}
