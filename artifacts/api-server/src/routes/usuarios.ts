import { Router } from "express";
import { db, usuariosTable } from "@workspace/db";
import { and, eq, or } from "drizzle-orm";

const router = Router();

function isValidCPF(cpf: string): boolean {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return false;
  if (/^(\d)\1+$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i]) * (10 - i);
  let r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  if (r !== parseInt(d[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i]) * (11 - i);
  r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  return r === parseInt(d[10]);
}

function toUsuarioCriado(u: typeof usuariosTable.$inferSelect) {
  return {
    id: u.id,
    nome: u.nome,
    telefone: u.telefone ?? "",
    cpf: u.cpf ?? "",
    cidade: u.cidadeUsuario ?? "",
    estado: u.estado ?? "",
    pontos: u.pontos,
  };
}

// POST /api/usuarios/login
router.post("/usuarios/login", async (req, res) => {
  const { cpf, telefone } = req.body as Record<string, string>;
  const cleanCPF = String(cpf ?? "").replace(/\D/g, "");
  const cleanTel = String(telefone ?? "").replace(/\D/g, "");

  if (!cleanCPF || !cleanTel) {
    res.status(400).json({ error: "CPF e telefone são obrigatórios" });
    return;
  }

  const [found] = await db
    .select()
    .from(usuariosTable)
    .where(and(eq(usuariosTable.cpf, cleanCPF), eq(usuariosTable.telefone, cleanTel)))
    .limit(1);

  if (!found) {
    res.status(401).json({ error: "Usuário não encontrado. Verifique seus dados ou faça seu cadastro." });
    return;
  }

  if (found.bloqueado) {
    res.status(403).json({ error: "Sua conta foi bloqueada. Entre em contato com o suporte." });
    return;
  }

  // Streak tracking
  const now = new Date();
  let newStreak = found.streak ?? 0;
  if (found.ultimoLoginEm) {
    const lastDate = new Date(found.ultimoLoginEm);
    lastDate.setHours(0, 0, 0, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    if (lastDate.getTime() === yesterday.getTime()) {
      newStreak = (found.streak ?? 0) + 1;
    } else if (lastDate.getTime() === today.getTime()) {
      newStreak = found.streak ?? 1;
    } else {
      newStreak = 1;
    }
  } else {
    newStreak = 1;
  }
  await db.update(usuariosTable).set({ streak: newStreak, ultimoLoginEm: now }).where(eq(usuariosTable.id, found.id));

  res.json(toUsuarioCriado(found));
});

// POST /api/usuarios
router.post("/usuarios", async (req, res) => {
  const { nome, telefone, cpf, cidade, estado } = req.body as Record<string, string>;

  const cleanTelefone = String(telefone ?? "").replace(/\D/g, "");
  const cleanCPF = String(cpf ?? "").replace(/\D/g, "");

  if (!nome || nome.trim().length < 5) {
    res.status(400).json({ error: "Nome deve ter pelo menos 5 caracteres" });
    return;
  }
  if (cleanTelefone.length !== 11) {
    res.status(400).json({ error: "Telefone deve ter 11 dígitos (com DDD)" });
    return;
  }
  if (!isValidCPF(cleanCPF)) {
    res.status(400).json({ error: "CPF inválido" });
    return;
  }
  if (!cidade || !cidade.trim()) {
    res.status(400).json({ error: "Cidade é obrigatória" });
    return;
  }
  if (!estado || estado.trim().length !== 2) {
    res.status(400).json({ error: "Estado é obrigatório" });
    return;
  }

  const existing = await db
    .select({ id: usuariosTable.id, cpf: usuariosTable.cpf, telefone: usuariosTable.telefone })
    .from(usuariosTable)
    .where(or(eq(usuariosTable.cpf, cleanCPF), eq(usuariosTable.telefone, cleanTelefone)))
    .limit(1);

  if (existing.length > 0) {
    if (existing[0].cpf === cleanCPF) {
      res.status(409).json({ error: "CPF já cadastrado" });
    } else {
      res.status(409).json({ error: "Telefone já cadastrado" });
    }
    return;
  }

  const [created] = await db
    .insert(usuariosTable)
    .values({
      nome: nome.trim(),
      telefone: cleanTelefone,
      cpf: cleanCPF,
      cidadeUsuario: cidade.trim(),
      estado: estado.trim().toUpperCase(),
    })
    .returning();

  res.status(201).json(toUsuarioCriado(created));
});

export default router;
