import assert from "node:assert/strict";
import { test } from "node:test";
import { cellText, guessColumns, matchRoom, parseCsv, parseDate, parseSex } from "./sheet-import";

test("columns are found from the headers people actually use", () => {
  const c = guessColumns(["S/N", "Tenant's Name", "Phone No.", "Gender", "Room No", "Rent Expiry"]);
  assert.deepEqual([c.name, c.phone, c.sex, c.room, c.paidUntil], [1, 2, 3, 4, 5]);
  const split = guessColumns(["First Name", "Surname", "WhatsApp", "Block", "Room", "Paid until"]);
  assert.deepEqual([split.name, split.firstName, split.lastName, split.phone, split.block, split.room, split.paidUntil], [-1, 0, 1, 2, 3, 4, 5]);
});

test("CSV: quotes, commas inside quotes, semicolons, Windows line endings and Excel's BOM", () => {
  assert.deepEqual(parseCsv('﻿Name,Room\r\n"Okeke, Chidi",A3\r\n\r\n'), [
    ["Name", "Room"],
    ["Okeke, Chidi", "A3"],
  ]);
  assert.deepEqual(parseCsv('Name;Room\n"He said ""hi""";B2'), [
    ["Name", "Room"],
    ['He said "hi"', "B2"],
  ]);
});

test("dates: day first as written in Nigeria, Excel dates and serial numbers, month names", () => {
  assert.equal(parseDate("31/07/2027"), "2027-07-31");
  assert.equal(parseDate("1/8/27"), "2027-08-01");
  assert.equal(parseDate("2027-07-31"), "2027-07-31");
  assert.equal(parseDate("31 July 2027"), "2027-07-31");
  assert.equal(parseDate("July 31st, 2027"), "2027-07-31");
  assert.equal(parseDate(new Date(2027, 6, 31)), "2027-07-31");
  // The same day whether the sheet's date came out as midnight UTC or an hour either side
  assert.equal(parseDate(new Date(Date.UTC(2027, 6, 31))), "2027-07-31");
  assert.equal(parseDate(new Date(Date.UTC(2027, 6, 30, 23))), "2027-07-31", "local midnight in Lagos (UTC+1)");
  assert.equal(parseDate(new Date(Date.UTC(2027, 6, 31, 1))), "2027-07-31");
  assert.equal(parseDate(46599), "2027-07-31", "Excel's serial number for 31 Jul 2027");
  assert.equal(parseDate("31/02/2027"), null, "no 31 February");
  assert.equal(parseDate("soon"), null);
});

test("sex and phone numbers that lost their leading zero", () => {
  assert.equal(parseSex("F"), "Female");
  assert.equal(parseSex("male"), "Male");
  assert.equal(parseSex("?"), null);
  assert.equal(cellText(8031234567), "08031234567");
  assert.equal(cellText(" Chidi "), "Chidi");
});

test("rooms by name, by block and number, and only when it's unambiguous", () => {
  const rooms = [
    { id: "A3", label: "A3", block: "Block A" },
    { id: "Ruby2", label: "Ruby 2", block: "Ruby" },
    { id: "Annex1", label: "1", block: "Annex" },
    { id: "Main1", label: "1", block: "Main" },
  ];
  assert.equal(matchRoom("a3", "", rooms)?.id, "A3");
  assert.equal(matchRoom("Room A3", "", rooms)?.id, "A3");
  assert.equal(matchRoom("ruby2", "", rooms)?.id, "Ruby2");
  assert.equal(matchRoom("1", "", rooms), null, "two blocks have a room 1");
  assert.equal(matchRoom("1", "Annex", rooms)?.id, "Annex1");
  assert.equal(matchRoom("Z9", "", rooms), null);
});
