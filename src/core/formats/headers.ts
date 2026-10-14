import { fold } from "../fold";

export type TargetKind = "name" | "first" | "last" | "phone" | "email" | "company" | "note" | "alias" | "group" | "id" | "ignore";

export const HEADERS: Record<Exclude<TargetKind, "ignore">, readonly string[]> = {
  id: ["contact_id", "contact id", "contactid", "id", "uid"],
  name: ["name", "full name", "fullname", "display name", "contact", "contact name", "الاسم", "اسم", "الاسم الكامل", "姓名", "名字", "名称", "联系人", "nombre", "nombre completo", "nom", "nom complet", "nome"],
  first: ["first name", "given name", "firstname", "first", "givenname", "الاسم الاول", "名", "nombre de pila", "prenom"],
  last: ["last name", "family name", "surname", "lastname", "last", "familyname", "اسم العائله", "العائله", "姓", "apellido", "apellidos", "nom de famille"],
  phone: ["phone", "phone number", "phones", "mobile", "mobile phone", "mobile number", "cell", "cell phone", "tel", "telephone", "number", "numbers", "msisdn", "whatsapp", "رقم", "الرقم", "الهاتف", "هاتف", "الجوال", "جوال", "رقم الهاتف", "رقم الجوال", "موبايل", "电话", "手机", "号码", "手机号", "电话号码", "telefono", "movil", "celular", "telephone portable", "portable", "numero"],
  email: ["email", "e-mail", "emails", "mail", "e-mail address", "email address", "البريد", "البريد الالكتروني", "ايميل", "邮箱", "电子邮件", "邮件", "correo", "correo electronico", "courriel", "adresse e-mail"],
  company: ["company", "organization", "organisation", "org", "business", "employer", "الشركه", "شركه", "جهه العمل", "公司", "单位", "empresa", "entreprise", "societe"],
  note: ["note", "notes", "comment", "comments", "remark", "ملاحظه", "ملاحظات", "备注", "nota", "notas", "remarque", "remarques"],
  alias: ["alias", "aliases", "nickname", "nicknames", "aka", "also known as", "اسم بديل", "اسماء بديله", "لقب", "كنيه", "الكنيه", "别名", "昵称", "apodo", "surnom"],
  group: ["group", "groups", "labels", "group membership", "category", "categories", "tags", "المجموعه", "المجموعات", "مجموعه", "分组", "群组", "标签", "grupo", "grupos", "groupe", "groupes"]
};

export function cleanHeader(header: string): string {
  return fold(header)
    .replace(/\s*-\s*(value|valor|valeur)$/, "")
    .replace(/[0-9#:*]+/g, " ")
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface HeaderGuess {
  kind: TargetKind | "skip" | null;
  exact: boolean;
}

export function guessHeader(header: string): HeaderGuess {
  const cleaned = cleanHeader(header);
  if (!cleaned) return { kind: null, exact: false };
  for (const kind of Object.keys(HEADERS) as Array<keyof typeof HEADERS>) {
    if (HEADERS[kind].includes(cleaned)) return { kind, exact: true };
  }
  if (/(type|label|etiquette|tipo)$/.test(cleaned)) return { kind: "skip", exact: false };
  if (/(phone|mobile|tel|cell|رقم|هاتف|جوال|电话|手机|号码|telefono|movil)/.test(cleaned)) return { kind: "phone", exact: false };
  if (/(mail|بريد|邮)/.test(cleaned)) return { kind: "email", exact: false };
  if (/(company|organi[sz]ation|شرك|公司)/.test(cleaned)) return { kind: "company", exact: false };
  if (/(nick|alias|别名|昵称)/.test(cleaned)) return { kind: "alias", exact: false };
  if (/(group|مجموع|分组|grupo|groupe)/.test(cleaned)) return { kind: "group", exact: false };
  if (/(name|الاسم|姓名|nombre|\bnom\b)/.test(cleaned)) return { kind: "name", exact: false };
  return { kind: null, exact: false };
}
