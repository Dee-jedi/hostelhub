import type { Application, HostelState, Message, Occupant, Payment, Resident, Room, Settings, Sex, Ticket } from "./types";
import { addDays, addMonths, todayISO } from "./utils";

export const STATE_VERSION = 4;

export const DEFAULT_SETTINGS: Settings = {
  hostelName: "Grace Court Hostel",
  address: "Off University Road, Campus Gate",
  managerName: "Mrs. Adeyemi",
  managerPhone: "08031234567",
  rentAmount: 350_000,
  leaseMonths: 12,
  maxOccupants: 2,
  roomsPerBlock: 15,
  blocks: [
    { name: "A" },
    { name: "B" },
    { name: "C" },
    { name: "D" },
    { name: "E" },
    { name: "F" },
    { name: "G" },
    { name: "H" },
  ],
  reminderDays: [30, 14, 7, 1],
  bankName: "GTBank",
  accountName: "Grace Court Hostel Ltd",
  accountNumber: "0123456789",
  whatsappGroupLink: "https://chat.whatsapp.com/your-group-invite",
};

export const DEPARTMENTS: { faculty: string; departments: string[] }[] = [
  { faculty: "Engineering", departments: ["Computer Engineering", "Electrical Engineering", "Mechanical Engineering", "Civil Engineering", "Chemical Engineering"] },
  { faculty: "Science", departments: ["Computer Science", "Microbiology", "Biochemistry", "Physics", "Mathematics", "Industrial Chemistry"] },
  { faculty: "Social Sciences", departments: ["Economics", "Political Science", "Sociology", "Psychology", "Mass Communication"] },
  { faculty: "Management Sciences", departments: ["Accounting", "Business Administration", "Banking & Finance", "Marketing"] },
  { faculty: "Arts", departments: ["English", "History", "Philosophy", "Theatre Arts"] },
  { faculty: "Law", departments: ["Law"] },
  { faculty: "Health Sciences", departments: ["Nursing", "Medical Laboratory Science", "Pharmacy", "Medicine & Surgery"] },
];

export const LEVELS = ["100", "200", "300", "400", "500", "600"];

export const STATES = [
  "Lagos", "Ogun", "Oyo", "Osun", "Ondo", "Ekiti", "Kwara", "Edo", "Delta", "Rivers", "Anambra", "Enugu", "Imo",
  "Abia", "Ebonyi", "Kogi", "Benue", "Plateau", "Kaduna", "Kano", "FCT", "Akwa Ibom", "Cross River", "Bayelsa",
];

const MALE_NAMES = ["Chinedu", "Tunde", "Emeka", "Ibrahim", "Segun", "Obinna", "Femi", "Uche", "Kelechi", "Tobi", "Ayo", "Musa", "Daniel", "David", "Samuel", "Victor", "Joshua", "Damilola", "Ikenna", "Kunle", "Yusuf", "Chukwuma", "Babatunde", "Seyi", "Michael", "Godwin", "Nnamdi", "Abdul", "Peter", "Sodiq"];
const FEMALE_NAMES = ["Chioma", "Aisha", "Funmilayo", "Ngozi", "Blessing", "Temitope", "Amaka", "Zainab", "Adaeze", "Bisola", "Esther", "Grace", "Precious", "Folake", "Halima", "Ifeoma", "Joy", "Kemi", "Mercy", "Nneka", "Oluchi", "Ruth", "Sade", "Tolu", "Uju", "Victoria", "Yetunde", "Favour", "Deborah", "Rukayat"];
const SURNAMES = ["Okafor", "Adeyemi", "Bello", "Okonkwo", "Balogun", "Eze", "Ogunleye", "Nwosu", "Abubakar", "Olawale", "Ibe", "Adebayo", "Chukwu", "Afolabi", "Onyeka", "Ojo", "Usman", "Akinola", "Obi", "Salami", "Nwachukwu", "Oladipo", "Ekwueme", "Lawal", "Okeke", "Ayodele", "Mohammed", "Igwe", "Fashola", "Anyanwu"];
const RELATIONS = ["Father", "Mother", "Uncle", "Aunt", "Brother", "Sister", "Guardian"];

/** Small deterministic PRNG so the demo data is stable between resets. */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildRooms(settings: Settings, existing: Room[] = []): Room[] {
  const byId = new Map(existing.map((r) => [r.id, r]));
  const rooms: Room[] = [];
  for (const block of settings.blocks) {
    for (let n = 1; n <= settings.roomsPerBlock; n++) {
      const id = `${block.name}${n}`;
      const prev = byId.get(id);
      rooms.push(prev ?? { id, block: block.name, number: n, underMaintenance: false });
    }
  }
  return rooms;
}

export function createDemoState(): HostelState {
  const rand = mulberry32(2026);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const phone = () => pick(["080", "081", "070", "090", "091"]) + String(Math.floor(10_000_000 + rand() * 89_999_999));
  const today = todayISO();
  const settings = DEFAULT_SETTINGS;

  const rooms = buildRooms(settings);
  rooms[17].underMaintenance = true;
  rooms[17].note = "Ceiling leak being repaired";
  rooms[96].underMaintenance = true;
  rooms[96].note = "Repainting";

  const residents: Resident[] = [];
  const payments: Payment[] = [];
  let receipt = 1001;

  const makeStudent = (sex: Sex) => {
    const first = pick(sex === "Male" ? MALE_NAMES : FEMALE_NAMES);
    const last = pick(SURNAMES);
    const fac = pick(DEPARTMENTS);
    return {
      fullName: `${first} ${last}`,
      sex,
      phone: phone(),
      email: `${first}.${last}${Math.floor(rand() * 90 + 10)}@gmail.com`.toLowerCase(),
      matricNo: `${pick(["19", "20", "21", "22", "23", "24", "25"])}/${fac.faculty.slice(0, 3).toUpperCase()}/${String(Math.floor(rand() * 900 + 100))}`,
      department: pick(fac.departments),
      faculty: fac.faculty,
      level: pick(LEVELS.slice(0, 5)),
      stateOfOrigin: pick(STATES),
      homeAddress: `${Math.floor(rand() * 80 + 1)}, ${pick(["Allen Avenue", "Aba Road", "Ring Road", "Market Street", "Old Airport Road", "Station Road"])}`,
      nextOfKinName: `${pick(rand() > 0.5 ? MALE_NAMES : FEMALE_NAMES)} ${last}`,
      nextOfKinPhone: phone(),
      nextOfKinRelationship: pick(RELATIONS),
      occupants: [] as Occupant[],
    };
  };

  const makeOccupant = (sex: Sex): Occupant => ({
    fullName: `${pick(sex === "Male" ? MALE_NAMES : FEMALE_NAMES)} ${pick(SURNAMES)}`,
    phone: phone(),
    department: pick(pick(DEPARTMENTS).departments),
    level: pick(LEVELS.slice(0, 5)),
  });

  for (const room of rooms) {
    if (room.underMaintenance) continue;
    const gender: Sex = rand() < 0.5 ? "Male" : "Female";
    // ~88% of rooms are let; about half of tenants share with one person
    if (rand() < 0.12) continue;
    {
      // Spread lease ends so the demo has expired, expiring and healthy rents
      const bucket = rand();
      const offset =
        bucket < 0.08 ? -Math.floor(rand() * 40 + 1)
        : bucket < 0.22 ? Math.floor(rand() * 30)
        : bucket < 0.32 ? Math.floor(rand() * 30 + 31)
        : Math.floor(rand() * 300 + 61);
      const leaseEnd = addDays(today, offset);
      const leaseStart = addMonths(leaseEnd, -settings.leaseMonths);
      const id = `res_${residents.length + 1}`;
      residents.push({
        ...makeStudent(gender),
        occupants: rand() < 0.5 ? [makeOccupant(gender)] : [],
        id,
        roomId: room.id,
        status: "active",
        checkInDate: leaseStart,
        leaseStart,
        leaseEnd,
        createdAt: leaseStart,
      });
      const method = pick(["Transfer", "Transfer", "Transfer", "Cash", "POS"] as const);
      payments.push({
        id: `pay_${payments.length + 1}`,
        receiptNo: `RCP-${receipt++}`,
        residentId: id,
        amount: settings.rentAmount,
        method,
        reference: method === "Transfer" ? `TRF${Math.floor(rand() * 9_000_000 + 1_000_000)}` : "",
        date: addDays(leaseStart, -Math.floor(rand() * 5)),
        periodStart: leaseStart,
        periodEnd: leaseEnd,
      });
    }
  }

  // A few former residents for history
  for (let i = 0; i < 6; i++) {
    const sex: Sex = i % 2 ? "Female" : "Male";
    const end = addDays(today, -Math.floor(rand() * 200 + 30));
    residents.push({
      ...makeStudent(sex),
      id: `res_${residents.length + 1}`,
      roomId: null,
      status: "moved_out",
      checkInDate: addMonths(end, -12),
      leaseStart: addMonths(end, -12),
      leaseEnd: end,
      movedOutDate: end,
      createdAt: addMonths(end, -12),
    });
  }

  payments.sort((a, b) => b.date.localeCompare(a.date));

  const active = residents.filter((r) => r.status === "active");
  const now = new Date();
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
  const messages: Message[] = [
    {
      id: "msg_1",
      kind: "notice",
      channel: "WhatsApp",
      recipientIds: active.map((r) => r.id),
      body: "Good evening everyone. Water supply will be interrupted on Saturday from 8am–12pm for tank cleaning. Please store water on Friday. — Management",
      sentAt: ago(3),
      automated: false,
    },
    {
      id: "msg_2",
      kind: "reminder",
      channel: "SMS",
      recipientIds: active.slice(0, 9).map((r) => r.id),
      body: "Hi {name}, your rent for room {room} expires on {expiry}. Kindly renew to keep your space.",
      sentAt: ago(1),
      automated: true,
    },
  ];

  const applications: Application[] = [
    { ...makeStudent("Female"), occupants: [makeOccupant("Female")], id: "app_1", preferredBlock: "G", status: "pending", submittedAt: ago(0.2), paymentReference: "TRF8823410" },
    { ...makeStudent("Male"), id: "app_2", preferredBlock: "B", status: "pending", submittedAt: ago(0.8), paymentReference: "" },
    { ...makeStudent("Male"), occupants: [makeOccupant("Male")], id: "app_3", preferredBlock: "A", status: "pending", submittedAt: ago(1.5), paymentReference: "TRF7712093" },
    { ...makeStudent("Female"), id: "app_4", preferredBlock: "H", status: "pending", submittedAt: ago(2.1), paymentReference: "" },
  ];

  const at = (i: number) => active[i % active.length];
  const tickets: Ticket[] = [
    { id: "tk_1", roomId: at(4).roomId!, residentId: at(4).id, title: "Bathroom tap is leaking", category: "Plumbing", status: "open", createdAt: ago(0.5) },
    { id: "tk_2", roomId: at(40).roomId!, residentId: at(40).id, title: "Socket near the window sparks", category: "Electrical", status: "in_progress", createdAt: ago(2) },
    { id: "tk_3", roomId: at(88).roomId!, residentId: at(88).id, title: "Wardrobe door hinge broken", category: "Furniture", status: "open", createdAt: ago(4) },
    { id: "tk_4", roomId: at(120).roomId!, residentId: at(120).id, title: "Corridor bulb not working", category: "Electrical", status: "resolved", createdAt: ago(9), resolvedAt: ago(7) },
    { id: "tk_5", roomId: at(150).roomId!, residentId: at(150).id, title: "Toilet cistern not flushing", category: "Plumbing", status: "open", createdAt: ago(1) },
  ];

  return {
    version: STATE_VERSION,
    settings,
    rooms,
    residents,
    payments,
    messages,
    applications,
    tickets,
    sentReminderKeys: [],
  };
}

export function createEmptyState(): HostelState {
  return {
    version: STATE_VERSION,
    settings: { ...DEFAULT_SETTINGS, hostelName: "My Hostel" },
    rooms: buildRooms(DEFAULT_SETTINGS),
    residents: [],
    payments: [],
    messages: [],
    applications: [],
    tickets: [],
    sentReminderKeys: [],
  };
}
