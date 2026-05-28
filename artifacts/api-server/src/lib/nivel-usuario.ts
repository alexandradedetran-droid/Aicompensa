export type Nivel = "Iniciante" | "Explorador" | "Caçador" | "Especialista" | "Mestre" | "Lenda";

export function getNivelUsuario(pontos: number): Nivel {
  if (pontos >= 1000) return "Lenda";
  if (pontos >= 600)  return "Mestre";
  if (pontos >= 300)  return "Especialista";
  if (pontos >= 150)  return "Caçador";
  if (pontos >= 50)   return "Explorador";
  return "Iniciante";
}

export function getNextNivel(nivel: Nivel): Nivel | null {
  const order: Nivel[] = ["Iniciante", "Explorador", "Caçador", "Especialista", "Mestre", "Lenda"];
  const idx = order.indexOf(nivel);
  return idx < order.length - 1 ? order[idx + 1] : null;
}
