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
  /** Charges on top of rent (utility, caution deposit…) */
  charges?: ExtraCharge[];
  /** Where online rent settles: the hostel's Paystack subaccount (set up during sign-up) */
  payout?: { subaccountCode: string; bankCode: string; verifiedAt: string; mode: "test" | "live" };
}

/** Who may book rooms in a block. */
export type BlockOccupancy = "male" | "female" | "any";

/** hostels/{h}/blocks/{blockId}: any named group of rooms (Block A, Ruby, Annex, Boys' Wing) */
export interface Block {
  id: string;
  name: string;
  order: number;
  /** Who can stay; the booking page only offers students blocks they may book. Absent = anyone. */
  who?: BlockOccupancy;
  /** The class new rooms in this block get ("Ruby is the 2-in-a-room row") */
  defaultTypeId?: string;
}

/** Room features shown to students. */
export type RoomFeature = "own_toilet" | "kitchen" | "ac" | "furnished";

/** hostels/{h}/roomTypes/{typeId}: a room class (size, how it's charged, price) */
export interface RoomType {
  id: string;
  name: string;
  capacity: RoomCapacity;
  /** Per bed space or per room, for this class (one hostel can mix both) */
  pricingMode: PricingMode;
  /** Rent for one space (the room, or one bed) for the hostel's default rent option */
  price: number;
  /** Rent for each rent option, by rent period id; `price` is the default option's entry */
  prices?: Record<string, number>;
  features?: RoomFeature[];
}

/** hostels/{h}/rooms/{roomId}. Older rooms' ids double as labels ("H15"); new ones have their own label. */
export interface HostelRoom {
  id: string;
  label: string;
  blockId: string;
  number: number;
  typeId: string;
  maintenance: { note?: string } | null;
}

/**
 * hostels/{h}/rentPeriods/{periodId}: a rent option. "rolling" runs `months` from move-in
 * (per year, 6 months…); "session" has fixed dates that everyone shares.
 */
export type RentPeriod = (
  | { id: string; kind: "rolling"; name: string; months: number }
  | { id: string; kind: "session"; name: string; start: string; end: string }
) & {
  /** Students can choose it on the booking page; otherwise it's only for tenants added by hand. Absent = yes. */
  online?: boolean;
  order?: number;
};

/** A charge on top of rent, kept on the hostel (hostels/{h}.charges). */
export interface ExtraCharge {
  id: string;
  name: string;
  amount: number;
  /** "once": with the first payment only (moving in); "every": with every rent payment */
  when: "once" | "every";
  /** Given back at move-out (a caution deposit); not counted for the service fee */
  refundable: boolean;
}

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
