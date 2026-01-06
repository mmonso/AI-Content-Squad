
import { GoogleGenAI, Type } from "@google/genai";
import { ReviewResponse, FinalApprovalResponse } from "../types";

export interface ProjectContext {
  topic: string;
  objective: string;
  persona: string;
  audience: string;
  worldview: string;
}

const replacePlaceholders = (prompt: string, replacements: Record<string, string>) => {
  let result = prompt;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }
  return result;
};

export const geminiService = {
  async researchTopic(ctx: ProjectContext, promptTemplate: string): Promise<{ content: string; sources: Array<{ title: string; uri: string }> }> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const finalPrompt = replacePlaceholders(promptTemplate, {
      topic: ctx.topic,
      objective: ctx.objective,
    });

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: finalPrompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "text/plain"
      }
    });

    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks
      ?.map((chunk: any) => chunk.web ? { title: chunk.web.title, uri: chunk.web.uri } : null)
      .filter((s: any) => s !== null) || [];
      
    // Remove duplicates
    const uniqueSources = sources.filter((s, index, self) =>
        index === self.findIndex((t) => (
            t.uri === s.uri
        ))
    );

    return {
      content: response.text || "Pesquisa não retornou resultados.",
      sources: uniqueSources
    };
  },

  async writeContent(ctx: ProjectContext, researchData: string, promptTemplate: string): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const finalPrompt = replacePlaceholders(promptTemplate, {
      topic: ctx.topic,
      objective: ctx.objective,
      persona: ctx.persona,
      audience: ctx.audience,
      worldview: ctx.worldview,
      research: researchData
    });

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: finalPrompt,
      config: {
        temperature: 0.9,
      }
    });
    return response.text || "Erro ao gerar conteúdo.";
  },

  async reviewContent(content: string, ctx: ProjectContext, promptTemplate: string): Promise<ReviewResponse> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const finalPrompt = replacePlaceholders(promptTemplate, {
      content,
      topic: ctx.topic,
      objective: ctx.objective,
      persona: ctx.persona,
      audience: ctx.audience,
      worldview: ctx.worldview
    });

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: finalPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            status: { type: Type.STRING, enum: ["CORRIGIR", "APROVAR"] },
            feedback: { type: Type.STRING, description: "Críticas detalhadas." }
          },
          required: ["status", "feedback"]
        }
      }
    });
    return JSON.parse(response.text || "{}") as ReviewResponse;
  },

  async correctContent(content: string, feedback: string, ctx: ProjectContext, promptTemplate: string): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const finalPrompt = replacePlaceholders(promptTemplate, {
      content,
      feedback,
      topic: ctx.topic,
      objective: ctx.objective,
      persona: ctx.persona,
      audience: ctx.audience,
      worldview: ctx.worldview
    });

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: finalPrompt,
      config: {
        temperature: 0.5,
      }
    });
    return response.text || "Erro ao corrigir conteúdo.";
  },

  async manageApproval(content: string, ctx: ProjectContext, promptTemplate: string): Promise<FinalApprovalResponse> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const finalPrompt = replacePlaceholders(promptTemplate, {
      content,
      topic: ctx.topic,
      objective: ctx.objective,
      persona: ctx.persona,
      audience: ctx.audience,
      worldview: ctx.worldview
    });

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: finalPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            status: { type: Type.STRING, enum: ["OK", "CORRIGIR"] },
            comentario: { type: Type.STRING, description: "Veredito final." }
          },
          required: ["status", "comentario"]
        }
      }
    });
    return JSON.parse(response.text || "{}") as FinalApprovalResponse;
  },

  async generateImage(content: string, promptTemplate: string): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // First, use pro to generate a good visual prompt
    const promptResponse = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: replacePlaceholders(promptTemplate, { content }),
    });
    
    const visualPrompt = promptResponse.text || "An editorial illustration for a professional article.";

    // Then, use image model to generate the actual image
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            text: visualPrompt,
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: "16:9",
        },
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    
    throw new Error("Falha ao gerar imagem.");
  }
};
