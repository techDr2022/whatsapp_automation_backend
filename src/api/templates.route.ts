import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { extractVariables } from "../lib/template.renderer";
import type { Template } from "../types/database";

export const templatesRouter = Router();

// GET /api/templates
templatesRouter.get("/", async (_req: Request, res: Response) => {
  const { data, error } = await supabase
    .from("templates")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return void res.status(500).json({ error: error.message });
  res.json({ data: data as Template[] });
});

// POST /api/templates
templatesRouter.post("/", async (req: Request, res: Response) => {
  const { name, body, variables } = req.body as {
    name?: string;
    body?: string;
    variables?: string[];
  };

  if (!name || !body) {
    return void res.status(400).json({ error: "name and body are required." });
  }

  const resolvedVariables = variables ?? extractVariables(body);

  const { data, error } = await supabase
    .from("templates")
    .insert({ name, body, variables: resolvedVariables })
    .select()
    .single();

  if (error) return void res.status(500).json({ error: error.message });
  res.status(201).json({ data: data as Template });
});

// PUT /api/templates/:id
templatesRouter.put("/:id", async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { name, body, variables } = req.body as {
    name?: string;
    body?: string;
    variables?: string[];
  };

  if (!name || !body) {
    return void res.status(400).json({ error: "name and body are required." });
  }

  const resolvedVariables = variables ?? extractVariables(body);

  const { data, error } = await supabase
    .from("templates")
    .update({ name, body, variables: resolvedVariables })
    .eq("id", id)
    .select()
    .single();

  if (error) return void res.status(500).json({ error: error.message });
  res.json({ data: data as Template });
});
