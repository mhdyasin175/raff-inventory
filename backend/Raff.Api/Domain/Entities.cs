namespace Raff.Api.Domain;

public class Category
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public List<Product> Products { get; set; } = [];
}

public class Product
{
    public int Id { get; set; }
    public string Sku { get; set; } = string.Empty;

    /// <summary>The manufacturer's barcode (EAN-13, UPC-A, …) when the product has one. Scanning it finds the product;
    /// products without one are labelled and scanned by their SKU.</summary>
    public string? Barcode { get; set; }

    public string Name { get; set; } = string.Empty;
    public int CategoryId { get; set; }
    public Category Category { get; set; } = null!;

    /// <summary>Unit of measure, e.g. قطعة / كرتونة / كغ.</summary>
    public string Unit { get; set; } = "قطعة";

    /// <summary>Shelf / bin location inside the warehouse, e.g. A-03-2.</summary>
    public string? Location { get; set; }

    public decimal CostPrice { get; set; }
    public decimal SalePrice { get; set; }

    /// <summary>When on-hand quantity (in a warehouse, or in total) is at or below this level the product needs reordering.</summary>
    public int ReorderLevel { get; set; }

    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    /// <summary>On-hand quantity per warehouse. Changed only through stock movements.</summary>
    public List<StockLevel> StockLevels { get; set; } = [];

    public List<StockMovement> Movements { get; set; } = [];
}

public class Warehouse
{
    public int Id { get; set; }

    /// <summary>Short code shown on labels and in lists, e.g. MAIN, ALP.</summary>
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Address { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public List<StockLevel> StockLevels { get; set; } = [];
}

/// <summary>How many units of one product are in one warehouse.</summary>
public class StockLevel
{
    public int ProductId { get; set; }
    public Product Product { get; set; } = null!;
    public int WarehouseId { get; set; }
    public Warehouse Warehouse { get; set; } = null!;

    public int Quantity { get; set; }

    /// <summary>Optimistic concurrency token: two users moving the same stock at once can't corrupt the balance.</summary>
    public byte[]? RowVersion { get; set; }
}

public enum MovementType
{
    In = 1,
    Out = 2,
    Adjustment = 3,

    /// <summary>Leg of a transfer leaving this movement's warehouse (paired with a TransferIn by TransferId).</summary>
    TransferOut = 4,

    /// <summary>Leg of a transfer arriving in this movement's warehouse.</summary>
    TransferIn = 5,
}

public class StockMovement
{
    public long Id { get; set; }
    public int ProductId { get; set; }
    public Product Product { get; set; } = null!;
    public MovementType Type { get; set; }

    /// <summary>The warehouse whose stock this movement changed.</summary>
    public int WarehouseId { get; set; }
    public Warehouse Warehouse { get; set; } = null!;

    /// <summary>For transfers: the other warehouse (destination of a TransferOut, source of a TransferIn).</summary>
    public int? CounterpartWarehouseId { get; set; }
    public Warehouse? CounterpartWarehouse { get; set; }

    /// <summary>Links the two legs of one transfer.</summary>
    public Guid? TransferId { get; set; }

    /// <summary>Signed change applied to on-hand stock (+ for In, - for Out, either for Adjustment).</summary>
    public int QuantityChange { get; set; }

    /// <summary>Stock level in this warehouse right after this movement was applied (useful for audit).</summary>
    public int BalanceAfter { get; set; }

    public decimal UnitPrice { get; set; }

    /// <summary>Supplier for In, customer / department for Out.</summary>
    public string? Party { get; set; }

    /// <summary>Invoice or document number.</summary>
    public string? Reference { get; set; }

    public string? Note { get; set; }
    public DateTime OccurredAt { get; set; } = DateTime.UtcNow;

    public int CreatedById { get; set; }
    public User CreatedBy { get; set; } = null!;
}

public class Role
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }

    /// <summary>System roles (Admin) cannot be deleted or stripped of permissions.</summary>
    public bool IsSystem { get; set; }

    public List<RolePermission> Permissions { get; set; } = [];
    public List<User> Users { get; set; } = [];
}

public class RolePermission
{
    public int RoleId { get; set; }
    public Role Role { get; set; } = null!;
    public string Permission { get; set; } = string.Empty;
}

public class User
{
    public int Id { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public int RoleId { get; set; }
    public Role Role { get; set; } = null!;

    /// <summary>When set, the user only sees and works on this warehouse. Null means all warehouses.</summary>
    public int? WarehouseId { get; set; }
    public Warehouse? Warehouse { get; set; }

    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastLoginAt { get; set; }
}
