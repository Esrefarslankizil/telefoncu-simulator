import type { generateCustomerEncounter } from "../data/PhoneCatalog";

export type CustomerEncounter = ReturnType<typeof generateCustomerEncounter>;
export type Customer = CustomerEncounter["customer"];
export type GeneratedPhone = CustomerEncounter["phone"];
export type PhoneDefect = GeneratedPhone["defects"][number];
