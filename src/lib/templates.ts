export interface Template {
  id: string;
  label: string;
  body: string;
}

export const TEMPLATES: Template[] = [
  {
    id: "renew",
    label: "Rent renewal reminder",
    body: "Hello {name}, this is a reminder from {hostel}. Your rent for room {room} expires on {expiry} ({days} days left). Renewal is {amount}. Pay to {bank} and send your receipt to {managerPhone}. Thank you!",
  },
  {
    id: "expired",
    label: "Rent expired / move-out notice",
    body: "Hello {name}, your rent for room {room} at {hostel} expired on {expiry}. Please renew within 7 days or prepare to vacate the room. Contact {manager} on {managerPhone}.",
  },
  {
    id: "welcome",
    label: "Welcome message",
    body: "Welcome to {hostel}, {name}! You have been allocated room {room}. Your rent runs until {expiry}. Reach {manager} on {managerPhone} for anything you need.",
  },
  {
    id: "notice",
    label: "General notice",
    body: "Hello {name}, please note: ",
  },
];

export const PLACEHOLDERS = ["{name}", "{fullName}", "{room}", "{expiry}", "{days}", "{amount}", "{hostel}", "{bank}", "{manager}", "{managerPhone}"];
