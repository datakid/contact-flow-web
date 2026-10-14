import { db } from "./db";
import { translate } from "./i18n";
import { useApp } from "./store";
import type { Selection } from "../core/db/library";
import { digitsOf, styleNumber } from "../core/phone";
import { vcardOf } from "../core/formats/vcard";
import type { Contact, ContactInput } from "../core/types";
import { emptyContactInput } from "../core/types";

function lang() {
  return useApp.getState().lang;
}

export async function copyText(text: string): Promise<void> {
  const state = useApp.getState();
  try {
    await navigator.clipboard.writeText(text);
    state.toast(translate(state.lang, "copied"));
  } catch {
    state.toast(translate(state.lang, "copied"), null, "error");
  }
}

export function contactToInput(contact: Contact): ContactInput {
  return { ...contact };
}

export async function saveContactInput(input: ContactInput, undoable = true): Promise<Contact | null> {
  const state = useApp.getState();
  const isNew = !input.id;
  try {
    const result = await db.saveContact(input, input.name || translate(state.lang, "newContact"));
    await state.refresh();
    state.toast(translate(state.lang, "savedToast"), undoable ? "last" : null);
    if (isNew) state.setFocused(result.contact.id);
    return result.contact;
  } catch (error) {
    state.toast(error instanceof Error ? error.message : String(error), null, "error");
    return null;
  }
}

export async function undoLast(): Promise<void> {
  const state = useApp.getState();
  const result = await db.undo(null);
  await state.refresh();
  if (result) state.toast(`${translate(state.lang, "undone")}: ${result.undone.label}`);
}

export async function setStarred(selection: Selection, starred: boolean): Promise<void> {
  const state = useApp.getState();
  const count = await db.setStarred(selection, starred, starred ? translate(lang(), "star") : translate(lang(), "unstar"));
  await state.refresh();
  state.toast(translate(state.lang, starred ? "starredToast" : "unstarredToast", count), "last");
}

export async function toggleStar(contact: { id: string; starred: boolean }): Promise<void> {
  await setStarred({ kind: "ids", ids: [contact.id] }, !contact.starred);
}

export async function addToGroup(selection: Selection, groupId: number): Promise<void> {
  const state = useApp.getState();
  const count = await db.addToGroup(selection, groupId, translate(state.lang, "addToGroup"));
  await state.refresh();
  state.toast(translate(state.lang, "addedToGroupToast", count), "last");
}

export async function removeFromGroup(selection: Selection, groupId: number): Promise<void> {
  const state = useApp.getState();
  const count = await db.removeFromGroup(selection, groupId, translate(state.lang, "removeFromGroup"));
  await state.refresh();
  state.toast(translate(state.lang, "removedFromGroupToast", count), "last");
}

export async function deleteSelection(selection: Selection): Promise<void> {
  const state = useApp.getState();
  const count = await db.deleteContacts(selection, translate(state.lang, "delete"));
  state.clearSelection();
  if (selection.kind === "ids" && state.focusedId && selection.ids.includes(state.focusedId)) state.setFocused(null);
  if (selection.kind === "filter") state.setFocused(null);
  await state.refresh();
  state.toast(translate(state.lang, "deleted", count), "last");
}

export async function createGroupNamed(name: string): Promise<number | null> {
  const state = useApp.getState();
  const id = await db.createGroup(name);
  await state.refresh();
  return id;
}

export function messageUrl(channel: "whatsapp" | "signal" | "sms", number: string, text = ""): string {
  const digits = digitsOf(number);
  const body = text ? encodeURIComponent(text) : "";
  if (channel === "whatsapp") return `https://wa.me/${digits}${body ? `?text=${body}` : ""}`;
  if (channel === "signal") return `https://signal.me/#p/+${digits}`;
  return `sms:${styleNumber(number, "intl")}${body ? `?&body=${body}` : ""}`;
}

export function vcardFor(contact: Contact): string {
  return vcardOf(
    { id: contact.id, name: contact.name, company: contact.company, note: contact.note, phones: contact.phones.map((p) => p.value), emails: contact.emails.map((e) => e.value), aliases: contact.aliases, groups: contact.groups },
    { everyNumber: true, emails: true, company: true, notes: true, aliases: true, groups: false, contactId: false, mapPhone: (v) => v }
  );
}

export async function shareVCard(contact: Contact): Promise<void> {
  const state = useApp.getState();
  const text = `${vcardFor(contact)}\r\n`;
  const file = new File([text], `${contact.name || "contact"}.vcf`, { type: "text/vcard" });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: contact.name });
      return;
    }
  } catch {
    return;
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  state.toast(translate(state.lang, "exported"));
}

export function blankContact(): ContactInput {
  return emptyContactInput();
}

export async function findDuplicatesOf(contact: Contact): Promise<void> {
  const state = useApp.getState();
  state.setFilter({ kind: "duplicates" });
  state.setSearch(contact.name || contact.phones[0]?.value || "");
}
