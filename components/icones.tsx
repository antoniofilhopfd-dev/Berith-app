import { Home, Lightbulb, CalendarDays, KanbanSquare, CheckCircle2, Send, Image as ImageIcon, BarChart3, Users, Settings } from "lucide-react";

/** Ícones do menu (nome em lib/nav.ts → componente). */
export const ICONES = { home: Home, lightbulb: Lightbulb, calendar: CalendarDays, kanban: KanbanSquare, check: CheckCircle2, send: Send, image: ImageIcon, chart: BarChart3, users: Users, settings: Settings } as const;
export type NomeIcone = keyof typeof ICONES;
