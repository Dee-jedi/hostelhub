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
  underMaintenance: boolean;
  note?: string;
}

/** Someone sharing the room with the tenant. Recorded for accountability, not billed. */
export interface Occupant {
  fullName: string;
  phone: string;
  department: string;
  level: string;
}

export interface StudentInfo {
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
}

/** The tenant: the person who rents (and pays for) the room. */
export interface Resident extends StudentInfo {
  id: string;
  roomId: string | null;
  status: "active" | "moved_out";
  checkInDate: string; // ISO date (YYYY-MM-DD)
  leaseStart: string;
  leaseEnd: string;
  movedOutDate?: string;
  createdAt: string;
}

export interface Payment {
  id: string;
  receiptNo: string;
  residentId: string;
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

export interface Application extends StudentInfo {
  id: string;
  preferredBlock: string;
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
  paymentReference: string;
}

export type TicketCategory = "Plumbing" | "Electrical" | "Furniture" | "Cleaning" | "Security" | "Other";

export interface Ticket {
  id: string;
  roomId: string;
  residentId: string | null;
  title: string;
  category: TicketCategory;
  status: "open" | "in_progress" | "resolved";
  createdAt: string;
  resolvedAt?: string;
}

export interface HostelState {
  version: number;
  settings: Settings;
  rooms: Room[];
  residents: Resident[];
  payments: Payment[];
  messages: Message[];
  applications: Application[];
  tickets: Ticket[];
  /** Tracks which automated reminders were already sent: `${residentId}:${leaseEnd}:${days}` */
  sentReminderKeys: string[];
}
