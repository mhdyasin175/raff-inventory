namespace Raff.Api.Auth;

/// <summary>
/// Every permission in the system. Each one is registered as an authorization policy
/// of the same name, so controllers use [Authorize(Policy = Permissions.X)].
/// </summary>
public static class Permissions
{
    public const string ClaimType = "perm";

    public const string DashboardView = "dashboard.view";

    public const string ProductsView = "products.view";
    public const string ProductsManage = "products.manage";

    public const string CategoriesManage = "categories.manage";

    public const string MovementsView = "movements.view";
    public const string MovementsIn = "movements.in";
    public const string MovementsOut = "movements.out";
    public const string MovementsAdjust = "movements.adjust";

    public const string ReportsView = "reports.view";

    public const string UsersManage = "users.manage";
    public const string RolesManage = "roles.manage";

    public record PermissionInfo(string Key, string Group, string Label);

    /// <summary>Metadata used by the UI to render the permissions matrix.</summary>
    public static readonly IReadOnlyList<PermissionInfo> All =
    [
        new(DashboardView, "لوحة التحكم", "عرض لوحة التحكم"),
        new(ProductsView, "المنتجات", "عرض المنتجات"),
        new(ProductsManage, "المنتجات", "إضافة وتعديل المنتجات"),
        new(CategoriesManage, "المنتجات", "إدارة التصنيفات"),
        new(MovementsView, "الحركات", "عرض سجل الحركات"),
        new(MovementsIn, "الحركات", "تسجيل إدخال"),
        new(MovementsOut, "الحركات", "تسجيل إخراج"),
        new(MovementsAdjust, "الحركات", "تسوية الجرد"),
        new(ReportsView, "التقارير", "عرض التقارير والتصدير"),
        new(UsersManage, "الإدارة", "إدارة المستخدمين"),
        new(RolesManage, "الإدارة", "إدارة الأدوار والصلاحيات"),
    ];

    public static readonly IReadOnlySet<string> Keys = All.Select(p => p.Key).ToHashSet();
}
