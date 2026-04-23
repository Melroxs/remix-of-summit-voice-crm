import Papa from "papaparse";
import { normalizePhoneToE164 } from "./phone";
import { supabase } from "@/integrations/supabase/client";

export const CONTACT_FIELDS = [
  { key: "first_name", label: "First Name", required: true },
  { key: "last_name", label: "Last Name", required: true },
  { key: "phone_raw", label: "Phone", required: false },
  { key: "address", label: "Address", required: false },
  { key: "city", label: "City", required: false },
  { key: "state", label: "State", required: false },
  { key: "zip_code", label: "Zip Code", required: false },
  { key: "county", label: "County", required: false },
  { key: "title", label: "Title", required: false },
  { key: "owner_renter", label: "Owner/Renter", required: false },
  { key: "home_value", label: "Home Value", required: false },
  { key: "household_income", label: "Household Income", required: false },
  { key: "credit_rating", label: "Credit Rating", required: false },
  { key: "cool_notes", label: "Notes", required: false },
  { key: "timezone", label: "Timezone", required: false },
] as const;

export type ColumnMapping = Record<string, string>; // csv_header -> contact_field_key

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
    phone_raw: ["phone", "phone_raw", "phone_number", "phonenumber", "cell", "mobile", "telephone"],
    address: ["address", "street", "street_address", "address1"],
    city: ["city"],
    state: ["state", "st"],
    zip_code: ["zip", "zip_code", "zipcode", "postal", "postal_code"],
    county: ["county"],
    title: ["title"],
    owner_renter: ["owner_renter", "ownerrenter", "owner/renter", "ownership"],
    home_value: ["home_value", "homevalue", "home value", "property_value"],
    household_income: ["household_income", "income", "hhi"],
    credit_rating: ["credit_rating", "credit", "credit_score"],
    cool_notes: ["notes", "cool_notes", "comments"],
    timezone: ["timezone", "tz", "time_zone"],
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
  const mappedRows: { idx: number; contact: Record<string, string | null> }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const contact: Record<string, string | null> = {};
    for (const [csvHeader, fieldKey] of Object.entries(mapping)) {
      if (fieldKey && row[csvHeader] !== undefined) {
        contact[fieldKey] = row[csvHeader]?.trim() || null;
      }
    }
    mappedRows.push({ idx: i + 2, contact }); // +2 for 1-indexed + header row
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
        if (normalized.valid) {
          contact.phone_e164 = normalized.e164;

          // Duplicate detection
          if (existingPhones.has(normalized.e164) || phonesInBatch.has(normalized.e164)) {
            result.duplicates++;
            result.failed++;
            batchErrors.push({ row: idx, message: `Duplicate phone: ${normalized.e164}`, data: contact as any });
            continue;
          }
          phonesInBatch.add(normalized.e164);
        } else {
          // Keep the raw phone but no e164
          contact.phone_e164 = null;
        }
      }

      toInsert.push({ ...contact, import_job_id: jobId });
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
      import_job_id: jobId,
      row_number: e.row,
      error_message: e.message,
      raw_payload: buildErrorMetadata(e.data),
    }));
    await supabase.from("lead_import_rows").insert(errorRows);
  }

  return result;
}
