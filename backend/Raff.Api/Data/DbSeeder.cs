using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Raff.Api.Auth;
using Raff.Api.Domain;

namespace Raff.Api.Data;

/// <summary>
/// Creates the database (if missing) and fills it with roles, users and — optionally —
/// ~4 months of realistic demo activity so the dashboard and reports have something to show.
/// </summary>
public static class DbSeeder
{
    public static async Task SeedAsync(IServiceProvider services, bool demoData)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher<User>>();

        await db.Database.EnsureCreatedAsync();

        if (!await db.Roles.AnyAsync())
            await SeedRolesAndUsersAsync(db, hasher);

        if (demoData && !await db.Products.AnyAsync())
            await SeedDemoInventoryAsync(db);
    }

    private static async Task SeedRolesAndUsersAsync(AppDbContext db, IPasswordHasher<User> hasher)
    {
        Role MakeRole(string name, string desc, bool system, params string[] perms) => new()
        {
            Name = name,
            Description = desc,
            IsSystem = system,
            Permissions = perms.Select(p => new RolePermission { Permission = p }).ToList()
        };

        var admin = MakeRole("مدير النظام", "صلاحيات كاملة على النظام", true, [.. Permissions.Keys]);
        var manager = MakeRole("مدير المخزن", "يدير المنتجات والحركات والتقارير", false,
            Permissions.DashboardView, Permissions.ProductsView, Permissions.ProductsManage,
            Permissions.CategoriesManage, Permissions.MovementsView, Permissions.MovementsIn,
            Permissions.MovementsOut, Permissions.MovementsAdjust, Permissions.ReportsView);
        var keeper = MakeRole("أمين المخزن", "يسجل الإدخال والإخراج اليومي", false,
            Permissions.DashboardView, Permissions.ProductsView, Permissions.MovementsView,
            Permissions.MovementsIn, Permissions.MovementsOut);
        var viewer = MakeRole("مراجع", "اطلاع فقط على البيانات والتقارير", false,
            Permissions.DashboardView, Permissions.ProductsView, Permissions.MovementsView,
            Permissions.ReportsView);

        db.Roles.AddRange(admin, manager, keeper, viewer);

        User MakeUser(string fullName, string username, string password, Role role)
        {
            var u = new User { FullName = fullName, Username = username, Role = role };
            u.PasswordHash = hasher.HashPassword(u, password);
            return u;
        }

        db.Users.AddRange(
            MakeUser("محمد العلي", "admin", "Admin@123", admin),
            MakeUser("سامر الحلبي", "manager", "Manager@123", manager),
            MakeUser("ريم خليل", "keeper", "Keeper@123", keeper),
            MakeUser("وسيم داود", "viewer", "Viewer@123", viewer));

        await db.SaveChangesAsync();
    }

    private record SeedProduct(string Category, string Prefix, string Name, string Unit,
        decimal Cost, decimal Margin, int Reorder, int Demand);

    private static async Task SeedDemoInventoryAsync(AppDbContext db)
    {
        var categories = new Dictionary<string, Category>
        {
            ["كهربائيات"] = new() { Name = "كهربائيات", Description = "كابلات، قواطع، مفاتيح وأفياش" },
            ["إنارة"] = new() { Name = "إنارة", Description = "لمبات وكشافات وملحقاتها" },
            ["عدد يدوية"] = new() { Name = "عدد يدوية", Description = "مفكات، زراديات، مفاتيح ربط" },
            ["عدد كهربائية"] = new() { Name = "عدد كهربائية", Description = "دريلات، صواريخ، منشار" },
            ["سباكة"] = new() { Name = "سباكة", Description = "قساطل، وصلات، حنفيات" },
            ["دهانات"] = new() { Name = "دهانات", Description = "دهان، معجون، فراشي" },
            ["تثبيت ولواصق"] = new() { Name = "تثبيت ولواصق", Description = "براغي، فيشر، سيليكون" },
        };
        db.Categories.AddRange(categories.Values);

        SeedProduct[] items =
        [
            new("كهربائيات", "ELC", "كابل نحاس 2.5 مم - لفة 100 م", "لفة", 38m, 0.22m, 15, 3),
            new("كهربائيات", "ELC", "كابل نحاس 1.5 مم - لفة 100 م", "لفة", 24m, 0.22m, 15, 3),
            new("كهربائيات", "ELC", "قاطع كهربائي 16 أمبير", "قطعة", 3.2m, 0.35m, 40, 9),
            new("كهربائيات", "ELC", "قاطع كهربائي 32 أمبير", "قطعة", 4.1m, 0.35m, 30, 5),
            new("كهربائيات", "ELC", "مفتاح إنارة مزدوج أبيض", "قطعة", 1.1m, 0.45m, 80, 14),
            new("كهربائيات", "ELC", "فيش جداري ثلاثي", "قطعة", 1.4m, 0.45m, 80, 12),
            new("كهربائيات", "ELC", "علبة توزيع 12 خط", "قطعة", 9.5m, 0.30m, 10, 2),
            new("إنارة", "LGT", "لمبة LED 12 واط أبيض", "قطعة", 0.9m, 0.60m, 120, 25),
            new("إنارة", "LGT", "لمبة LED 18 واط أصفر", "قطعة", 1.3m, 0.55m, 80, 14),
            new("إنارة", "LGT", "كشاف خارجي 50 واط", "قطعة", 7.8m, 0.40m, 15, 3),
            new("إنارة", "LGT", "شريط LED 5 م مع محول", "علبة", 5.5m, 0.50m, 20, 4),
            new("إنارة", "LGT", "سبوت سقفي دائري", "قطعة", 2.2m, 0.50m, 60, 10),
            new("عدد يدوية", "HND", "طقم مفكات 6 قطع", "طقم", 4.5m, 0.45m, 12, 2),
            new("عدد يدوية", "HND", "زرادية عازلة 8 إنش", "قطعة", 3.9m, 0.45m, 12, 2),
            new("عدد يدوية", "HND", "شريط قياس 5 م", "قطعة", 1.6m, 0.55m, 25, 4),
            new("عدد يدوية", "HND", "مطرقة 500 غ", "قطعة", 3.1m, 0.45m, 10, 1),
            new("عدد كهربائية", "PWR", "دريل شحن 18 فولت", "قطعة", 42m, 0.28m, 5, 1),
            new("عدد كهربائية", "PWR", "صاروخ جلخ 115 مم", "قطعة", 28m, 0.28m, 5, 1),
            new("عدد كهربائية", "PWR", "قرص قص معادن 115 مم", "قطعة", 0.6m, 0.70m, 100, 18),
            new("عدد كهربائية", "PWR", "طقم ريش دريل 13 قطعة", "طقم", 3.8m, 0.50m, 15, 3),
            new("سباكة", "PLB", "قسطل PPR قطر 20 - 4 م", "قطعة", 2.4m, 0.35m, 50, 10),
            new("سباكة", "PLB", "كوع PPR قطر 20", "قطعة", 0.15m, 0.90m, 300, 45),
            new("سباكة", "PLB", "حنفية مطبخ خلاط", "قطعة", 14m, 0.40m, 8, 1),
            new("سباكة", "PLB", "شريط تفلون", "قطعة", 0.12m, 1.00m, 200, 30),
            new("دهانات", "PNT", "دهان بلاستيك أبيض 18 ل", "سطل", 21m, 0.25m, 12, 2),
            new("دهانات", "PNT", "معجون جدران 20 كغ", "كيس", 6.5m, 0.30m, 20, 3),
            new("دهانات", "PNT", "فرشاة دهان 3 إنش", "قطعة", 0.8m, 0.60m, 40, 6),
            new("دهانات", "PNT", "رولة دهان 9 إنش", "قطعة", 1.7m, 0.55m, 30, 4),
            new("تثبيت ولواصق", "FIX", "براغي خشب 4×40 - علبة 200", "علبة", 1.9m, 0.50m, 40, 6),
            new("تثبيت ولواصق", "FIX", "فيشر بلاستيك 8 مم - علبة 100", "علبة", 0.9m, 0.60m, 50, 8),
            new("تثبيت ولواصق", "FIX", "سيليكون شفاف 280 مل", "قطعة", 1.2m, 0.55m, 60, 9),
            new("تثبيت ولواصق", "FIX", "شريط لاصق عازل كهرباء", "قطعة", 0.25m, 0.80m, 150, 20),
        ];

        var rnd = new Random(2026);
        var counters = new Dictionary<string, int>();
        var products = new List<(Product P, SeedProduct S)>();
        char[] aisles = ['A', 'B', 'C', 'D', 'E'];

        foreach (var s in items)
        {
            counters[s.Prefix] = counters.GetValueOrDefault(s.Prefix) + 1;
            var p = new Product
            {
                Sku = $"{s.Prefix}-{counters[s.Prefix] * 7 + 100:0000}",
                Name = s.Name,
                Category = categories[s.Category],
                Unit = s.Unit,
                Location = $"{aisles[rnd.Next(aisles.Length)]}-{rnd.Next(1, 13):00}-{rnd.Next(1, 5)}",
                CostPrice = s.Cost,
                SalePrice = Math.Round(s.Cost * (1 + s.Margin), 2),
                ReorderLevel = s.Reorder,
                CreatedAt = DateTime.UtcNow.AddDays(-125),
            };
            products.Add((p, s));
        }
        db.Products.AddRange(products.Select(x => x.P));

        var keeper = await db.Users.FirstAsync(u => u.Username == "keeper");
        var manager = await db.Users.FirstAsync(u => u.Username == "manager");

        string[] suppliers = ["شركة الضياء للتجهيزات الكهربائية", "مؤسسة المتين للعدد", "مستودعات الريّان للسباكة", "شركة ألوان للدهانات", "مؤسسة الإتقان التجارية"];
        string[] customers = ["ورشة الأمل للصيانة", "مقاولات البيت الحديث", "محل النجمة للأدوات", "ورشة صيانة المدرسة", "زبون نقدي", "شركة البنيان للمقاولات", "مكتب الهندسة المتحدة"];

        var movements = new List<StockMovement>();
        var start = DateTime.UtcNow.Date.AddDays(-120);
        int invoiceNo = 1040, receiptNo = 310;

        // Opening stock.
        foreach (var (p, s) in products)
        {
            var qty = s.Reorder * 3 + rnd.Next(s.Demand * 4, s.Demand * 10 + 5);
            p.Quantity = qty;
            movements.Add(new StockMovement
            {
                Product = p, Type = MovementType.In, QuantityChange = qty, BalanceAfter = qty,
                UnitPrice = p.CostPrice, Party = suppliers[rnd.Next(suppliers.Length)],
                Reference = $"RC-{receiptNo++}", Note = "رصيد افتتاحي",
                OccurredAt = start.AddHours(9), CreatedBy = manager,
            });
        }

        // Daily activity. A handful of fast movers are deliberately left un-restocked near the
        // end so the "needs reorder" list is never empty in the demo.
        var neglected = products.OrderByDescending(x => x.S.Demand).Take(4).Select(x => x.P).ToHashSet();

        for (var day = 1; day <= 120; day++)
        {
            var date = start.AddDays(day);
            var isFriday = date.DayOfWeek == DayOfWeek.Friday;
            var busy = 1.0 + day / 240.0; // business grows slowly over the period
            var outCount = isFriday ? rnd.Next(0, 3) : (int)(rnd.Next(4, 10) * busy);

            for (var i = 0; i < outCount; i++)
            {
                var (p, s) = products[rnd.Next(products.Count)];
                var qty = Math.Max(1, (int)(rnd.Next(1, s.Demand * 2 + 2) * busy));
                if (p.Quantity < qty) continue;
                p.Quantity -= qty;
                movements.Add(new StockMovement
                {
                    Product = p, Type = MovementType.Out, QuantityChange = -qty, BalanceAfter = p.Quantity,
                    UnitPrice = p.SalePrice, Party = customers[rnd.Next(customers.Length)],
                    Reference = $"INV-{invoiceNo++}",
                    OccurredAt = date.AddHours(rnd.Next(8, 18)).AddMinutes(rnd.Next(60)),
                    CreatedBy = keeper,
                });
            }

            // Restock anything at/below reorder level (suppliers deliver mornings).
            foreach (var (p, s) in products)
            {
                if (p.Quantity > p.ReorderLevel || rnd.NextDouble() > 0.55) continue;
                if (neglected.Contains(p) && day > 84) continue;
                var qty = s.Reorder * 2 + s.Demand * rnd.Next(6, 14);
                p.Quantity += qty;
                movements.Add(new StockMovement
                {
                    Product = p, Type = MovementType.In, QuantityChange = qty, BalanceAfter = p.Quantity,
                    UnitPrice = p.CostPrice, Party = suppliers[rnd.Next(suppliers.Length)],
                    Reference = $"RC-{receiptNo++}",
                    OccurredAt = date.AddHours(8).AddMinutes(rnd.Next(50)), CreatedBy = manager,
                });
            }

            // Occasional stock-count adjustment (damage / miscount).
            if (day % 30 == 0)
            {
                var (p, _) = products[rnd.Next(products.Count)];
                var diff = -Math.Min(p.Quantity, rnd.Next(1, 4));
                if (diff != 0)
                {
                    p.Quantity += diff;
                    movements.Add(new StockMovement
                    {
                        Product = p, Type = MovementType.Adjustment, QuantityChange = diff, BalanceAfter = p.Quantity,
                        UnitPrice = p.CostPrice, Note = "تسوية جرد شهري - تالف",
                        OccurredAt = date.AddHours(17), CreatedBy = manager,
                    });
                }
            }
        }

        // Keep the timeline realistic: nothing in the future.
        var now = DateTime.UtcNow;
        foreach (var m in movements.Where(m => m.OccurredAt > now))
            m.OccurredAt = now.AddMinutes(-rnd.Next(5, 240));

        db.StockMovements.AddRange(movements);
        await db.SaveChangesAsync();
    }
}
