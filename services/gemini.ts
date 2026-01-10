
import { GoogleGenAI, Type } from "@google/genai";
import { ProjectConfig } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const replaceVars = (template: string, vars: Record<string, string>) => {
  return template.replace(/{{(\w+)}}/g, (_, k) => vars[k] || '');
};

export const geminiService = {
  // 1. Pesquisa com Grounding (Google Search)
  async research(topic: string, config: ProjectConfig, prompt: string) {
    const finalPrompt = replaceVars(prompt, { topic, ...config });
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: finalPrompt,
      config: { tools: [{ googleSearch: {} }] }
    });
    
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks
      ?.map((c: any) => c.web ? { title: c.web.title, uri: c.web.uri } : null)
      .filter(Boolean) || [];

    return { content: response.text, sources };
  },

  // 2. Escrita Criativa
  async write(research: string, config: ProjectConfig, prompt: string) {
    const finalPrompt = replaceVars(prompt, { research, ...config });
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: finalPrompt,
    });
    return response.text;
  },

  // 3. Revisão com JSON Schema
  async review(content: string, config: ProjectConfig, prompt: string) {
    const finalPrompt = replaceVars(prompt, { content, ...config });
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: finalPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            approved: { type: Type.BOOLEAN },
            feedback: { type: Type.STRING }
          },
          required: ["approved", "feedback"]
        }
      }
    });
    return JSON.parse(response.text);
  },

  // 4. Geração de Imagem Editorial
  async generateArt(content: string, promptTemplate: string) {
    // Primeiro, pede ao Gemini 3 para criar um prompt visual épico em inglês
    const promptGen = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: `Baseado neste artigo, crie um prompt detalhado em inglês para uma ilustração editorial artística: ${content}`
    });
    
    const visualPrompt = promptGen.text;
    
    // Segundo, gera a imagem
    const imgResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: visualPrompt }] },
      config: { imageConfig: { aspectRatio: "16:9" } }
    });

    const part = imgResponse.candidates?.[0]?.content.parts.find(p => p.inlineData);
    return part ? `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` : null;
  }
};
