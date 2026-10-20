export type Role = "owner" | "seller";

export interface Profile {
  id: string;
  login_slug: string | null;
  display_name: string;
  display_name_ar: string | null;
  role: Role;
  active: boolean;
  phone: string | null;
  created_at: string;
}

export interface LoginName {
  id: string;
  login_slug: string;
  display_name: string;
  display_name_ar: string | null;
  role: Role;
}

export interface Item {
  id: string;
  sheet_ref: string;
  item_no: string | null;
  description_zh: string | null;
  description_en: string | null;
  description_ar: string | null;
  category: string | null;
  page_no: number | null;
  cartons: number | null;
  qty_per_carton: number | null;
  initial_qty: number;
  stock_qty: number;
  cost_usd: number;
  landed_cost_usd: number | null;
  default_price_usd: number;
  rmb_price: number | null;
  photo_path: string | null;
  needs_review: string | null;
  active: boolean;
}

export interface Device {
  id: string;
  user_id: string;
  nickname: string;
  device_label: string | null;
  user_agent: string | null;
  last_seen: string;
}

export type PaymentStatus = "paid" | "partial" | "unpaid";

export interface Sale {
  id: string;
  sale_no: number;
  seller_id: string;
  device_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  location: string | null;
  sold_at: string;
  note: string | null;
  total_usd: number;
  paid_usd: number;
  payment_status: PaymentStatus;
  voided: boolean;
  void_reason: string | null;
  voided_by: string | null;
  voided_at: string | null;
  created_at: string;
}

export interface SaleLine {
  id: string;
  sale_id: string;
  item_id: string;
  qty: number;
  unit_price_usd: number;
  unit_cost_usd: number;
  line_total: number;
}

export interface SaleWithLines extends Sale {
  sale_lines: (SaleLine & { items: Pick<Item, "sheet_ref" | "item_no" | "description_en" | "description_ar" | "photo_path"> })[];
  profiles: Pick<Profile, "display_name" | "display_name_ar" | "phone"> | null;
  devices: Pick<Device, "nickname" | "device_label"> | null;
}

export interface StockMovement {
  id: number;
  item_id: string;
  delta: number;
  reason: "initial" | "sale" | "void" | "adjustment" | "return" | "damaged";
  ref_sale_id: string | null;
  note: string | null;
  user_id: string | null;
  device_id: string | null;
  created_at: string;
  profiles?: Pick<Profile, "display_name" | "display_name_ar"> | null;
  devices?: Pick<Device, "nickname" | "device_label"> | null;
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  location: string | null;
}

export interface CartLine {
  item: Item;
  qty: number;
  unitPrice: number;
}
