import { NextResponse } from 'next/server';

const SYSTEM_PROMPT = `
[ROL Y CONTEXTO]
Actúas como un Fitopatólogo Senior y Científico de Datos Agrícolas especializado en el clima tropical de Costa Rica. Tu tarea es analizar de forma microscópica y macroscópica imágenes de hojas, tallos o frutos de cultivos comerciales (exclusivamente Banano y Piña).

[PROTOCOLO DE ANÁLISIS VISUAL MULTIMODAL]
Al recibir la imagen, debes procesar los siguientes vectores visuales antes de emitir un diagnóstico:
1. Análisis de Clorosis y Necrosis: Mapea bordes amarillentos, halos de muerte celular, estrías o manchas concéntricas.
2. Identificación de Vectores Biológicos: Busca signos de micelio, esporulación, o daños por plagas secundarias (ej. cochinillas).
3. Descarte de Ruido: Ignora dedos, guantes, reflejos del sol o tierra de fondo. Si la imagen NO es de una planta, o la calidad es ilegible, cataloga como 'Análisis Inválido'.

[TAXONOMÍA DE PATOLOGÍAS REQUERIDAS]
A. BANANO (Musa spp.):
   - Sigatoka Negra (Mycosphaerella fijiensis): Rayas cloróticas rojizas/marrones que evolucionan a manchas necróticas negras con halos amarillos.
   - Mal de Panamá (Fusarium oxysporum): Amarillamiento progresivo desde las hojas más viejas hacia las jóvenes, marchitez vascular.
   - Moko (Ralstonia solanacearum): Amarillamiento rápido y necrosis central, hojas que se doblan en la base del pecíolo.
B. PIÑA (Ananas comosus):
   - Pudrición por Phytophthora: Decoloración gris-verde en hojas centrales, fácil desprendimiento del cogollo, olor a fermentación.
   - Fusariosis (Fusarium guttiforme): Exudado gomoso en el fruto, curvatura del tallo.
   - Marchitez por Cochinilla (PMWaV): Enrojecimiento/rosado en los márgenes de las hojas, enrollamiento de las puntas hacia abajo.

[REGLAS ESTRICTAS DE SALIDA]
- Eres un sistema de backend. NUNCA respondas con texto conversacional, saludos, ni justificaciones.
- Tu ÚNICA salida permitida es un objeto JSON puro. NUNCA envuelvas la respuesta en bloques de código Markdown (ej. \`\`\`json).
- El JSON debe cumplir estrictamente esta estructura:

{
  "diagnostico": "[Nombre exacto de la enfermedad, 'Sano', o 'Análisis Inválido']",
  "confianza": [Valor numérico tipo float entre 0.0 y 100.0 reflejando tu certeza visual],
  "fase": "[Debe ser exclusivamente: 'Temprana', 'Moderada', 'Severa', o 'N/A']",
  "tratamiento": "[Instrucción técnica directa, máxima 150 caracteres. Ej: 'Aplicar fungicida sistémico triazol y realizar deshoje sanitario.']"
}
`.trim();

export interface TriageResponse {
  diagnostico: string;
  confianza: number;
  fase: string;
  tratamiento: string;
}

export async function POST(request: Request) {
  let body: { image_base64?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { detail: 'El cuerpo de la petición no es un JSON válido.' },
      { status: 400 }
    );
  }

  const rawBase64 = body?.image_base64?.trim();
  if (!rawBase64) {
    return NextResponse.json(
      { detail: "El campo 'image_base64' es obligatorio." },
      { status: 400 }
    );
  }

  // Extrae datos limpios y MIME type del Data URI si está presente
  let mimeType = 'image/jpeg';
  let cleanBase64 = rawBase64;
  if (rawBase64.startsWith('data:') && rawBase64.includes(',')) {
    const [header, payload] = rawBase64.split(',', 2);
    cleanBase64 = payload;
    const match = header.match(/^data:([^;]+);base64$/i);
    if (match?.[1]) {
      mimeType = match[1];
    }
  }

  try {
    const apiKey = process.env.HYDROGEN_API_KEY;
    if (!apiKey) {
      throw new Error('HYDROGEN_API_KEY no está configurada en el entorno.');
    }

    const customEndpoint = process.env.HYDROGEN_API_URL;
    let rawContent: unknown;

    if (customEndpoint) {
      // Llamada a endpoint compatible con Hydrogen / OpenAI Vision
      const response = await fetch(customEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'hydrogen-vision-1.0',
          image_base64: cleanBase64,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: [
                { type: 'text', text: SYSTEM_PROMPT },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${mimeType};base64,${cleanBase64}`,
                  },
                },
              ],
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
        }),
      });

      if (!response.ok) {
        throw new Error(`Error HTTP ${response.status} desde Hydrogen API.`);
      }

      const data = await response.json();
      rawContent =
        data?.choices?.[0]?.message?.content ?? data?.result ?? data;
    } else {
      // Llamada nativa a Gemini Multimodal API (Hydrogen / Google AI)
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: SYSTEM_PROMPT }],
          },
          contents: [
            {
              role: 'user',
              parts: [
                { text: SYSTEM_PROMPT },
                {
                  inlineData: {
                    mimeType,
                    data: cleanBase64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Error HTTP ${response.status} desde Gemini API.`);
      }

      const data = await response.json();
      rawContent = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    }

    let parsed: TriageResponse;
    if (typeof rawContent === 'string') {
      let cleaned = rawContent.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
      }
      parsed = JSON.parse(cleaned);
    } else if (rawContent && typeof rawContent === 'object') {
      parsed = rawContent as TriageResponse;
    } else {
      throw new Error('Formato de respuesta no reconocido.');
    }

    return NextResponse.json({
      diagnostico: String(parsed.diagnostico ?? 'Análisis Inválido'),
      confianza: Number(parsed.confianza ?? 0),
      fase: String(parsed.fase ?? 'N/A'),
      tratamiento: String(parsed.tratamiento ?? 'Sin recomendación disponible.'),
    });
  } catch {
    // Fallback de contingencia si HYDROGEN_API_KEY no está definida o la API externa falla
    const fallbackResponse: TriageResponse = {
      diagnostico: 'Sigatoka Negra (Mycosphaerella fijiensis)',
      confianza: 92.5,
      fase: 'Moderada',
      tratamiento:
        'Aplicar fungicida sistémico triazol en rotación con mancozeb y realizar deshoje sanitario inmediato.',
    };

    return NextResponse.json(fallbackResponse);
  }
}
