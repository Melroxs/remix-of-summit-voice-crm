import Papa from "papaparse";
import { normalizePhoneToE164 } from "./phone";
import { supabase } from "@/integrations/supabase/client";

export const CONTACT_FIELDS = [
  { key: "first_name", label: "First Name", required: true },
  { key: "last_name", label: "Last Name", required: true },
  { key: "full_name", label: "Full Name (auto-split)", required: false },
  { key: "phone_raw", label: "Phone", required: false },
  { key: "email", label: "Email", required: false },
  { key: "email_secondary", label: "Email 2", required: false },
  { key: "address", label: "Address", required: false },
  { key: "city", label: "City", required: false },
  { key: "state", label: "State", required: false },
  { key: "zip_code", label: "Zip Code", required: false },
  { key: "county", label: "County", required: false },
  { key: "mailing_address", label: "Mailing Address", required: false },
  { key: "mailing_city", label: "Mailing City", required: false },
  { key: "mailing_state", label: "Mailing State", required: false },
  { key: "mailing_zip", label: "Mailing Zip", required: false },
  { key: "property_type", label: "Property Type", required: false },
  { key: "year_built", label: "Year Built", required: false },
  { key: "title", label: "Title", required: false },
  { key: "owner_renter", label: "Owner/Renter", required: false },
  { key: "home_value", label: "Home Value", required: false },
  { key: "household_income", label: "Household Income", required: false },
  { key: "credit_rating", label: "Credit Rating", required: false },
  { key: "cool_notes", label: "Notes", required: false },
  { key: "timezone", label: "Timezone", required: false },
  { key: "lead_source", label: "Lead Source", required: false },
  { key: "tags", label: "Tags (comma-separated)", required: false },
] as const;

export type ColumnMapping = Record<string, string>; // csv_header -> contact_field_key

/**
 * Custom-field mappings use the prefix `custom:` followed by the destination
 * key inside `contacts.custom_fields`. Example: `custom:roof_age`.
 */
export const CUSTOM_FIELD_PREFIX = "custom:";
export function isCustomField(fieldKey: string): boolean {
  return fieldKey.startsWith(CUSTOM_FIELD_PREFIX);
}
export function customFieldName(fieldKey: string): string {
  return fieldKey.slice(CUSTOM_FIELD_PREFIX.length);
}
export function makeCustomFieldKey(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return CUSTOM_FIELD_PREFIX + (slug || "field");
}

export function parseCSV(file: File): Promise<{ headers: string[]; rows: Record<string, string>[]; }> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        resolve({
          headers: results.meta.fields || [],
          rows: results.data as Record<string, string>[],
        });
      },
      error: (err) => reject(err),
    });
  });
}

export function autoMapColumns(csvHeaders: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const aliases: Record<string, string[]> = {
    first_name: ["first_name", "firstname", "first name", "fname", "first"],
    last_name: ["last_name", "lastname", "last name", "lname", "last"],
    full_name: ["name", "full_name", "fullname", "full name", "contact_name", "contact name"],
    phone_raw: ["phone", "phone_raw", "phone_number", "phonenumber", "cell", "mobile", "telephone", "primary phone", "primary phone 1", "phone 1"],
    email: ["email", "email_address", "e-mail", "emailaddress", "email 1", "primary email"],
    email_secondary: ["email 2", "email_2", "secondary email", "secondary_email", "alt email", "alternate email"],
    address: ["address", "street", "street_address", "address1"],
    city: ["city"],
    state: ["state", "st"],
    zip_code: ["zip", "zip_code", "zipcode", "postal", "postal_code", "zip code"],
    county: ["county"],
    mailing_address: ["mailing address", "mailing_address", "mail address", "mail_address"],
    mailing_city: ["mailing city", "mailing_city", "mail city"],
    mailing_state: ["mailing state", "mailing_state", "mail state"],
    mailing_zip: ["mailing zip", "mailing_zip", "mailing zipcode", "mailing zip code", "mail zip"],
    property_type: ["property type", "property_type", "propertytype", "prop type"],
    year_built: ["year built", "year_built", "yearbuilt", "built year", "construction year"],
    title: ["title"],
    owner_renter: ["owner_renter", "ownerrenter", "owner/renter", "ownership"],
    home_value: ["home_value", "homevalue", "home value", "property_value"],
    household_income: ["household_income", "income", "hhi"],
    credit_rating: ["credit_rating", "credit", "credit_score"],
    cool_notes: ["notes", "cool_notes", "comments"],
    timezone: ["timezone", "tz", "time_zone"],
    lead_source: ["source", "lead_source", "leadsource", "channel", "origin"],
    tags: ["tags", "labels", "categories"],
  };

  for (const header of csvHeaders) {
    const lower = header.toLowerCase().trim();
    for (const [field, names] of Object.entries(aliases)) {
      if (names.includes(lower)) {
        mapping[header] = field;
        break;
      }
    }
  }
  return mapping;
}

// Only store diagnostic metadata — never raw PII values
const SENSITIVE_FIELDS = new Set([
  "phone_raw", "phone_e164", "credit_rating", "household_income",
  "home_value", "address", "zip_code", "county",
]);

function buildErrorMetadata(data: Record<string, string>): Record<string, string> {
  const metadata: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_FIELDS.has(key)) {
      // Only note whether the field was present/empty — never store the value
      metadata[key] = value ? "[present]" : "[empty]";
    } else {
      // Non-sensitive fields: store name and first_name/last_name for diagnostics
      metadata[key] = value || "[empty]";
    }
  }
  return metadata;
}

interface ProcessResult {
  successful: number;
  failed: number;
  duplicates: number;
  errors: { row: number; message: string; data: Record<string, string> }[];
}

/** Pre-process dry-run: count valid / duplicate / invalid rows without inserting. */
export interface DryRunResult {
  total: number;
  valid: number;
  duplicates: number;
  invalid: number;
  invalidReasons: Record<string, number>; // reason -> count
}

export async function dryRunImport(
  rows: Record<string, string>[],
  mapping: ColumnMapping
): Promise<DryRunResult> {
  const result: DryRunResult = {
    total: rows.length, valid: 0, duplicates: 0, invalid: 0, invalidReasons: {},
  };
  const phonesInBatch = new Set<string>();

  // Cache existing phones for dedup check
  const { data: existingContacts } = await supabase
    .from("contacts").select("phone_e164").not("phone_e164", "is", null);
  const existingPhones = new Set<string>();
  for (const c of existingContacts || []) {
    if (c.phone_e164) existingPhones.add(c.phone_e164);
  }

  const bump = (reason: string) => {
    result.invalid++;
    result.invalidReasons[reason] = (result.invalidReasons[reason] || 0) + 1;
  };

  for (const row of rows) {
    const c = mapRow(row, mapping);
    if (!c.first_name || !c.last_name) {
      bump("Missing first or last name");
      continue;
    }
    if (c.phone_raw) {
      const n = normalizePhoneToE164(c.phone_raw);
      if (!n.valid) {
        bump(`Invalid phone (${n.error || "unknown"})`);
        continue;
      }
      if (existingPhones.has(n.e164) || phonesInBatch.has(n.e164)) {
        result.duplicates++;
        continue;
      }
      phonesInBatch.add(n.e164);
    }
    result.valid++;
  }
  return result;
}

/** Map a CSV row through the user mapping, splitting `full_name` and parsing tags. */
function mapRow(row: Record<string, string>, mapping: ColumnMapping): Record<string, any> {
  const contact: Record<string, any> = {};
  const custom_fields: Record<string, string> = {};
  for (const [csvHeader, fieldKey] of Object.entries(mapping)) {
    if (!fieldKey || row[csvHeader] === undefined) continue;
    const raw = (row[csvHeader] || "").trim();
    if (!raw) continue;

    if (fieldKey === "full_name") {
      const parts = raw.split(/\s+/);
      if (parts.length === 1) {
        contact.first_name = contact.first_name || parts[0];
      } else {
        contact.first_name = contact.first_name || parts[0];
        contact.last_name = contact.last_name || parts.slice(1).join(" ");
      }
    } else if (fieldKey === "tags") {
      contact.tags = raw.split(/[,;|]/).map((t) => t.trim()).filter(Boolean);
    } else if (isCustomField(fieldKey)) {
      custom_fields[customFieldName(fieldKey)] = raw;
    } else {
      contact[fieldKey] = raw;
    }
  }
  if (Object.keys(custom_fields).length > 0) {
    contact.custom_fields = custom_fields;
  }
  return contact;
}

export async function processImport(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  jobId: string,
  campaignId: string | null,
  onProgress: (processed: number, total: number) => void
): Promise<ProcessResult> {
  const result: ProcessResult = { successful: 0, failed: 0, duplicates: 0, errors: [] };
  const BATCH_SIZE = 100;

  // Build mapped rows
  const mappedRows: { idx: number; contact: Record<string, any> }[] = [];
  for (let i = 0; i < rows.length; i++) {
    mappedRows.push({ idx: i + 2, contact: mapRow(rows[i], mapping) });
  }

  // Fetch existing phone numbers for dedup
  const phonesInBatch = new Set<string>();
  const existingPhones = new Set<string>();

  // Get all existing e164 phones
  const { data: existingContacts } = await supabase
    .from("contacts")
    .select("phone_e164")
    .not("phone_e164", "is", null);

  if (existingContacts) {
    for (const c of existingContacts) {
      if (c.phone_e164) existingPhones.add(c.phone_e164);
    }
  }

  // Process in batches
  for (let batchStart = 0; batchStart < mappedRows.length; batchStart += BATCH_SIZE) {
    const batch = mappedRows.slice(batchStart, batchStart + BATCH_SIZE);
    const toInsert: Record<string, string | null>[] = [];
    const batchErrors: { row: number; message: string; data: Record<string, string> }[] = [];

    for (const { idx, contact } of batch) {
      // Validate required fields
      if (!contact.first_name || !contact.last_name) {
        batchErrors.push({ row: idx, message: "Missing first_name or last_name", data: contact as any });
        result.failed++;
        continue;
      }

      // Normalize phone
      if (contact.phone_raw) {
        const normalized = normalizePhoneToE164(contact.phone_raw);
        if (!normalized.valid) {
          // Match manual-edit behavior: reject invalid phones rather than
          // inserting an inconsistent contact (raw set, e164 null).
          batchErrors.push({
            row: idx,
            message: `Invalid phone (${normalized.error || "unknown"})`,
            data: contact as any,
          });
          result.failed++;
          continue;
        }

        // Duplicate detection
        if (existingPhones.has(normalized.e164) || phonesInBatch.has(normalized.e164)) {
          result.duplicates++;
          result.failed++;
          batchErrors.push({
            row: idx,
            message: `Duplicate phone: ${normalized.e164}`,
            data: contact as any,
          });
          continue;
        }

        // Sync both fields to the canonical E.164 form (mirrors EditContactModal).
        contact.phone_e164 = normalized.e164;
        contact.phone_raw = normalized.e164;
        phonesInBatch.add(normalized.e164);
      }

      toInsert.push({ ...contact, lead_import_id: jobId });
    }

    // Batch insert
    if (toInsert.length > 0) {
      const { data: inserted, error } = await supabase
        .from("contacts")
        .insert(toInsert as any)
        .select("id");

      if (error) {
        result.failed += toInsert.length;
        batchErrors.push({ row: batchStart + 2, message: error.message, data: {} as any });
      } else {
        result.successful += inserted?.length || 0;

        // If campaign, link contacts
        if (campaignId && inserted && inserted.length > 0) {
          const campaignLinks = inserted.map((c) => ({
            campaign_id: campaignId,
            contact_id: c.id,
          }));
          await supabase.from("campaign_contacts").insert(campaignLinks);
        }
      }
    }

    result.errors.push(...batchErrors);
    onProgress(Math.min(batchStart + BATCH_SIZE, mappedRows.length), mappedRows.length);
  }

  // Update import job
  await supabase
    .from("lead_imports")
    .update({
      status: result.failed > 0 && result.successful === 0 ? "failed" : "completed",
      processed_rows: rows.length,
      successful_rows: result.successful,
      failed_rows: result.failed,
    } as any)
    .eq("id", jobId);

  // Store errors
  if (result.errors.length > 0) {
    const errorRows = result.errors.slice(0, 500).map((e) => ({
      lead_import_id: jobId,
      row_number: e.row,
      error_message: e.message,
      raw_payload: buildErrorMetadata(e.data),
    }));
    await supabase.from("lead_import_rows").insert(errorRows);
  }

  return result;
}
