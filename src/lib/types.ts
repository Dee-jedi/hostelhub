import type { BlockOccupancy, ExtraCharge, PricingMode, RoomType, StayOptionInfo } from "./model";

export type Sex = "Male" | "Female";
export type PaymentMethod = "Transfer" | "Cash" | "POS" | "Online";
export type Channel = "SMS" | "WhatsApp" | "Email";
export type RentStatus = "active" | "expiring" | "expired";

export interface BlockConfig {
  name: string;
}

export interface Settings {
  hostelName: string;
  address: string;
  managerName: string;
  managerPhone: string;
  rentAmount: number;
  leaseMonths: number;
  /** People allowed in one room: the tenant plus their co-occupants */
  maxOccupants: number;
  roomsPerBlock: number;
  blocks: BlockConfig[];
  /** Days before expiry when reminders go out automatically */
  reminderDays: number[];
  bankName: string;
  accountName: string;
  accountNumber: string;
  whatsappGroupLink: string;
}

export interface Room {
  id: string; // e.g. "H15"
  block: string;
  number: number;
  /** Its room type (size, per room or per bed, price); see HostelState.roomTypes */
  typeId?: string;
  underMaintenance: boolean;
  note?: string;
}

/** Someone sharing the room with the tenant. Recorded for accountability, not billed. */
export interface Occupant {
  /** False for someone who isn't a student; department and level are then blank */
  isStudent?: boolean;
  fullName: string;
  phone: string;
  faculty?: string;
  department: string;
  level: string;
}

export interface StudentInfo {
  /** False for working-class tenants; academic details are then optional */
  isStudent?: boolean;
  fullName: string;
  sex: Sex;
  phone: string;
  email: string;
  matricNo: string;
  department: string;
  faculty: string;
  level: string;
  stateOfOrigin: string;
  homeAddress: string;
  nextOfKinName: string;
  nextOfKinPhone: string;
  nextOfKinRelationship: string;
  occupants: Occupant[];
  /** Passport photograph (Firebase Storage download URL) */
  photoUrl?: string;
}

/** The tenant: the person who rents (and pays for) the room. */
export interface Resident extends StudentInfo {
  id: string;
  roomId: string | null;
  /** The space they rent: the room id itself, or `${roomId}-A`… for a bed in a per-bed room */
  spaceId?: string | null;
  status: "active" | "moved_out";
  checkInDate: string; // ISO date (YYYY-MM-DD)
  leaseStart: string;
  leaseEnd: string;
  movedOutDate?: string;
  createdAt: string;
  /** Tenant portal: notifications newer than this are unread */
  notificationsSeenAt?: string;
}

export interface Payment {
  id: string;
  receiptNo: string;
  residentId: string;
  /** The room this payment was for (receipts keep it even if the tenant moves later) */
  roomId?: string;
  amount: number;
  method: PaymentMethod;
  reference: string;
  date: string;
  periodStart: string;
  periodEnd: string;
  note?: string;
}

export interface Message {
  id: string;
  kind: "reminder" | "broadcast" | "notice";
  channel: Channel;
  recipientIds: string[];
  body: string;
  sentAt: string; // ISO datetime
  automated: boolean;
}

/**
 * An online booking from the public form. Its id doubles as the Paystack reference.
 * pending: checkout started; paid: verified and the tenant was added automatically;
 * needs_attention: paid, but the room was taken in the meantime, so staff must allocate one.
 */
export interface Booking extends StudentInfo {
  id: string;
  uid: string;
  roomId: string;
  amount: number;
  status: "pending" | "paid" | "needs_attention" | "resolved";
  createdAt: string;
  paidAt?: string;
  residentId?: string;
  receiptNo?: string;
  agent?: string;
  issue?: string;
}

export type PublicRoomStatus = "vacant" | "occupied" | "maintenance";

export interface PublicRoom {
  block: string;
  number: number;
  status: PublicRoomStatus;
  label?: string;
  typeId?: string;
  /** Per-bed rooms only: each bed's status */
  beds?: Record<string, "vacant" | "occupied">;
  note?: string;
}

export interface RoomHold {
  /** epoch ms */
  until: number;
  bookingId: string;
  uid: string;
}

/**
 * The single document the public booking form reads (one Firestore read per visit).
 * Holds no personal data: only room availability and the details a visitor needs.
 */
export interface PublicBookingDoc {
  info: {
    hostelName: string;
    address: string;
    rentAmount: number;
    leaseMonths: number;
    maxOccupants: number;
    blocks: string[];
    whatsappGroupLink: string;
    managerName: string;
    managerPhone: string;
    /** Room sizes and prices (multi-hostel listings) */
    roomTypes?: Pick<RoomType, "id" | "name" | "capacity" | "pricingMode" | "price" | "prices" | "features">[];
    /** Hostels set up through sign-up (see model.ts Listing) */
    blockNames?: Record<string, string>;
    blockWho?: Record<string, BlockOccupancy>;
    options?: StayOptionInfo[];
    defaultOptionId?: string;
    charges?: Pick<ExtraCharge, "name" | "amount" | "when" | "refundable">[];
    serviceFee?: boolean;
  };
  rooms: Record<string, PublicRoom>;
  holds: Record<string, RoomHold>;
}

export type TicketCategory = "Plumbing" | "Electrical" | "Furniture" | "Cleaning" | "Security" | "Other";

/** What a tenant is asking for. Older tickets have no kind and are repairs. */
export type RequestKind = "repair" | "complaint" | "room_change";

export interface TicketUpdate {
  at: string;
  by: "staff" | "tenant";
  text?: string;
  /** Set when this update changed the status */
  status?: Ticket["status"];
}

/** A request from a tenant (repair, complaint, room change), or a repair logged by staff. */
export interface Ticket {
  id: string;
  roomId: string;
  residentId: string | null;
  title: string;
  category: TicketCategory;
  /** declined is only used for requests staff turn down, e.g. a room change */
  status: "open" | "in_progress" | "resolved" | "declined";
  kind?: RequestKind;
  description?: string;
  photoUrl?: string;
  /** Room change: the room the tenant wants */
  requestedRoomId?: string;
  /** When staff first opened it; the tenant sees "Seen" */
  seenAt?: string;
  updates?: TicketUpdate[];
  createdAt: string;
  resolvedAt?: string;
}

export interface HostelState {
  version: number;
  settings: Settings;
  /** Room sizes and prices (multi-hostel); when absent, settings' rent and max occupants apply */
  roomTypes?: RoomType[];
  /** Whether this hostel rents whole rooms or single beds */
  rentalModel?: PricingMode;
  rooms: Room[];
  residents: Resident[];
  payments: Payment[];
  messages: Message[];
  bookings: Booking[];
  tickets: Ticket[];
  /** Tracks which automated reminders were already sent: `${residentId}:${leaseEnd}:${days}` */
  sentReminderKeys: string[];
}
