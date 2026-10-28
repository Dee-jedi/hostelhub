/*
 * The multi-hostel data model (docs/ARCHITECTURE-PLAN.md §3–4). Everything below lives under
 * hostels/{hostelId}/… except the public listing, which is listings/{hostelId}.
 *
 * The building (blocks, rooms) is separate from what is rented (spaces) and from who lives
 * there (residents and their tenancies). A space is the whole room when its room type is priced
 * per room, or one bed when priced per bed. Spaces aren't stored: a space id is the room id
 * (per room) or `${roomId}-${bed}` (per bed: A, B, C, D).
 */
import type { Hold, ListingRoom } from "./spaces";
import type { Booking, Message, Payment, StudentInfo, Ticket } from "./types";

export type PricingMode = "per_room" | "per_bed";
/** How many people a room takes. 8 is the most we support (beds A–H). */
export type RoomCapacity = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** hostels/{hostelId} */
export interface Hostel {
  id: string;
  name: string;
  address: string;
  manager: { name: string; phone: string };
  bank: { bankName: string; accountName: string; accountNumber: string };
  whatsappGroupLink: string;
  currency: "NGN";
  timezone: string;
  status: "draft" | "live" | "suspended";
  /** Whole rooms or single beds, for the whole hostel (each room type carries the same value) */
  rentalModel?: PricingMode;
  /** The room type new rooms get (e.g. when a block is added) */
  defaultTypeId?: string;
  /** Days before the end of a paid period when reminders go out */
  reminderDays: number[];
  /** The rent period new tenancies use unless another is chosen */
  defaultPeriodId: string;
  createdAt: string;
  /** The login that signed the hostel up (/start). Absent on hostels set up before sign-up existed. */
  ownerUid?: string;
  /** The address in parts, as sign-up collects it; `address` is the same joined into one line */
  location?: { street: string; city: string; state: string };
  /** Sign-up progress while `status` is "draft": the wizard resumes at `step` */
  onboarding?: { step: string; startedAt: string };
}

/** hostels/{h}/blocks/{blockId} */
export interface Block {
  id: string;
  name: string;
  order: number;
}

/** hostels/{h}/roomTypes/{typeId}: a room size and how it's charged */
export interface RoomType {
  id: string;
  name: string;
  capacity: RoomCapacity;
  pricingMode: PricingMode;
  /** Rent for one space (the room, or one bed) for one rent period */
  price: number;
}

/** hostels/{h}/rooms/{roomId}. Room ids stay as before (e.g. "H15"). */
export interface HostelRoom {
  id: string;
  label: string;
  blockId: string;
  number: number;
  typeId: string;
  maintenance: { note?: string } | null;
}

/** hostels/{h}/rentPeriods/{periodId} */
export type RentPeriod =
  | { id: string; kind: "rolling"; name: string; months: number }
  | { id: string; kind: "session"; name: string; start: string; end: string };

/** hostels/{h}/residents/{residentId}: the person, whether or not they live here now */
export interface HostelResident extends StudentInfo {
  id: string;
  /** Their login, if they have one. Rules let a tenant read records carrying their uid. */
  uid: string | null;
  createdAt: string;
  notificationsSeenAt?: string;
}

/**
 * hostels/{h}/tenancies/{tenancyId}: one stay in one space. Co-occupants are recorded here
 * (per-room spaces), since they belong to the stay, not the person.
 */
export interface Tenancy {
  id: string;
  residentId: string;
  uid: string | null;
  /** null while a staff-added tenant hasn't been given a room yet */
  roomId: string | null;
  spaceId: string | null;
  periodId: string;
  status: "active" | "ended";
  checkInDate: string;
  /** The rent period currently paid for */
  leaseStart: string;
  leaseEnd: string;
  movedOutDate?: string;
  occupants: StudentInfo["occupants"];
  createdAt: string;
}

/** hostels/{h}/charges/{chargeId}: what is owed (rent, deposit, fees). Used from Phase 3. */
export interface Charge {
  id: string;
  tenancyId: string;
  uid: string | null;
  kind: "rent" | "deposit" | "fee" | "discount" | "late_fee";
  label: string;
  amount: number;
  dueDate: string;
  paid: number;
  status: "open" | "paid" | "waived";
}

/** hostels/{h}/payments/{paymentId} */
export interface HostelPayment extends Payment {
  uid: string | null;
  tenancyId: string | null;
}

/** hostels/{h}/messages/{messageId}. recipientIds are resident ids; recipientUids their logins. */
export interface HostelMessage extends Message {
  recipientUids: string[];
}

/** hostels/{h}/requests/{requestId} (repairs, complaints, room changes) */
export interface HostelRequest extends Ticket {
  uid: string | null;
}

/** hostels/{h}/bookings/{bookingId} */
export interface HostelBooking extends Booking {
  spaceId: string;
}

/** listings/{hostelId}: everything the public booking page needs, no personal data */
export interface Listing {
  info: {
    hostelName: string;
    address: string;
    managerName: string;
    managerPhone: string;
    whatsappGroupLink: string;
    blocks: string[];
    roomTypes: Pick<RoomType, "id" | "name" | "capacity" | "pricingMode" | "price">[];
    /** The default room type's terms, as the current booking page shows them */
    rentAmount: number;
    leaseMonths: number;
    maxOccupants: number;
  };
  /** Keyed by room id. Holds are keyed by space id (the room id, or `${roomId}-A`… for beds). */
  rooms: Record<string, ListingRoom>;
  holds: Record<string, Hold>;
}

/** hostels/{h}/counters/receipts */
export interface ReceiptCounter {
  seq: number;
}

/** hostels/{h}/counters/reminders: which automated reminders already went out */
export interface ReminderLog {
  sentKeys: string[];
}
