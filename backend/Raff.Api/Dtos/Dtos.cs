using System.ComponentModel.DataAnnotations;
using Raff.Api.Domain;

namespace Raff.Api.Dtos;

public record PagedResult<T>(IReadOnlyList<T> Items, int Total, int Page, int PageSize);

// ---------- Auth ----------
public record LoginRequest(
    [Required(ErrorMessage = "اسم المستخدم مطلوب")] string Username,
    [Required(ErrorMessage = "كلمة المرور مطلوبة")] string Password);

public record CurrentUserDto(int Id, string FullName, string Username, string Role, IReadOnlyList<string> Permissions,
    int? WarehouseId = null, string? WarehouseName = null);

public record LoginResponse(string Token, DateTime ExpiresAt, CurrentUserDto User);

// ---------- Categories ----------
public record CategoryDto(int Id, string Name, string? Description, int ProductCount, decimal StockValue);

public record CategoryInput(
    [Required(ErrorMessage = "اسم التصنيف مطلوب"), MaxLength(100)] string Name,
    [MaxLength(300)] string? Description);

// ---------- Products ----------
public enum StockStatus { Ok, Low, Out }

public record ProductDto(
    int Id, string Sku, string Name, int CategoryId, string CategoryName, string Unit, string? Location,
    decimal CostPrice, decimal SalePrice, int Quantity, int ReorderLevel, bool IsActive,
    decimal StockValue, StockStatus Status, DateTime? LastMovementAt);

public record ProductInput(
    [Required(ErrorMessage = "رمز المنتج مطلوب"), MaxLength(40)] string Sku,
    [Required(ErrorMessage = "اسم المنتج مطلوب"), MaxLength(200)] string Name,
    [Range(1, int.MaxValue, ErrorMessage = "اختر التصنيف")] int CategoryId,
    [Required(ErrorMessage = "وحدة القياس مطلوبة"), MaxLength(30)] string Unit,
    [MaxLength(30)] string? Location,
    [Range(0, 1_000_000, ErrorMessage = "سعر التكلفة غير صالح")] decimal CostPrice,
    [Range(0, 1_000_000, ErrorMessage = "سعر البيع غير صالح")] decimal SalePrice,
    [Range(0, 1_000_000, ErrorMessage = "حد إعادة الطلب غير صالح")] int ReorderLevel,
    bool IsActive = true,
    [Range(0, 1_000_000, ErrorMessage = "الكمية الافتتاحية غير صالحة")] int OpeningQuantity = 0,
    int? OpeningWarehouseId = null);

/// <summary>A product's on-hand quantity in one warehouse.</summary>
public record ProductStockDto(int WarehouseId, string WarehouseCode, string WarehouseName, int Quantity);

// ---------- Movements ----------
public record MovementDto(
    long Id, int ProductId, string ProductName, string Sku, string Unit, MovementType Type,
    int QuantityChange, int BalanceAfter, decimal UnitPrice, decimal Total,
    string? Party, string? Reference, string? Note, DateTime OccurredAt, string CreatedBy,
    int WarehouseId, string WarehouseCode, string WarehouseName,
    int? CounterpartWarehouseId, string? CounterpartWarehouseCode, Guid? TransferId);

/// <summary>
/// For In/Out, Quantity is how many units entered/left <see cref="WarehouseId"/>.
/// For Adjustment, Quantity is the physically counted quantity; the system records the difference.
/// For a transfer, send Type = TransferOut with the source in WarehouseId and the destination in
/// ToWarehouseId; the API records both legs (TransferOut + TransferIn) together.
/// </summary>
public record MovementInput(
    [Range(1, int.MaxValue, ErrorMessage = "اختر المنتج")] int ProductId,
    [EnumDataType(typeof(MovementType), ErrorMessage = "نوع الحركة غير صالح")] MovementType Type,
    [Range(0, 1_000_000, ErrorMessage = "الكمية غير صالحة")] int Quantity,
    decimal? UnitPrice,
    [MaxLength(150)] string? Party,
    [MaxLength(60)] string? Reference,
    [MaxLength(500)] string? Note,
    DateTime? OccurredAt,
    int WarehouseId = 0,
    int? ToWarehouseId = null);

// ---------- Dashboard / reports ----------
public record DashboardSummary(
    int ActiveProducts, int TotalUnits, decimal StockValueCost, decimal StockValueSale,
    int LowStockCount, int OutOfStockCount,
    int MovementsToday, decimal SalesLast30, decimal SalesPrev30,
    int UnitsOutLast30, int UnitsInLast30);

public record TrendPoint(DateOnly Date, int UnitsIn, int UnitsOut, decimal ValueIn, decimal ValueOut);

public record CategoryValuePoint(int CategoryId, string Category, decimal StockValue, int Units, int Products);

public record TopProductPoint(int ProductId, string Sku, string Name, string Unit, int UnitsOut, decimal Revenue);

public record LowStockItem(int ProductId, string Sku, string Name, string Unit, int Quantity, int ReorderLevel, string? Location);

// ---------- Warehouses ----------
public record WarehouseDto(int Id, string Code, string Name, string? Address, bool IsActive,
    int Products, int Units, decimal StockValue, int Users);

public record WarehouseOption(int Id, string Code, string Name);

public record WarehouseInput(
    [Required(ErrorMessage = "رمز المستودع مطلوب"), MaxLength(10),
     RegularExpression("^[A-Za-z0-9-]{2,10}$", ErrorMessage = "الرمز: أحرف إنجليزية وأرقام (2 إلى 10)")] string Code,
    [Required(ErrorMessage = "اسم المستودع مطلوب"), MaxLength(100)] string Name,
    [MaxLength(200)] string? Address,
    bool IsActive = true);

// ---------- Users & roles ----------
public record UserDto(int Id, string FullName, string Username, int RoleId, string RoleName,
    bool IsActive, DateTime CreatedAt, DateTime? LastLoginAt, int? WarehouseId = null, string? WarehouseName = null);

public record UserCreate(
    [Required(ErrorMessage = "الاسم الكامل مطلوب"), MaxLength(120)] string FullName,
    [Required(ErrorMessage = "اسم المستخدم مطلوب"), MaxLength(60),
               RegularExpression("^[a-zA-Z0-9._-]{3,60}$", ErrorMessage = "اسم المستخدم: أحرف إنجليزية وأرقام فقط (3 أحرف على الأقل)")] string Username,
    [Required(ErrorMessage = "كلمة المرور مطلوبة"), MinLength(8, ErrorMessage = "كلمة المرور 8 أحرف على الأقل")] string Password,
    [Range(1, int.MaxValue, ErrorMessage = "اختر الدور")] int RoleId,
    int? WarehouseId = null);

public record UserUpdate(
    [Required(ErrorMessage = "الاسم الكامل مطلوب"), MaxLength(120)] string FullName,
    [Range(1, int.MaxValue, ErrorMessage = "اختر الدور")] int RoleId,
    bool IsActive,
    [MinLength(8, ErrorMessage = "كلمة المرور 8 أحرف على الأقل")] string? NewPassword,
    int? WarehouseId = null);

public record RoleDto(int Id, string Name, string? Description, bool IsSystem, int UserCount, IReadOnlyList<string> Permissions);

public record RoleInput(
    [Required(ErrorMessage = "اسم الدور مطلوب"), MaxLength(60)] string Name,
    [MaxLength(200)] string? Description,
    IReadOnlyList<string> Permissions);

public record PermissionDto(string Key, string Group, string Label);

public record RangeSummary(int Movements, int UnitsIn, int UnitsOut, decimal PurchasesValue, decimal Revenue, decimal GrossProfit);
