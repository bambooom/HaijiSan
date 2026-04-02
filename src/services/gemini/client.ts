import { GEMINI_API_KEY, GEMINI_MODEL } from '../../app-config';
import type { GeminiGenerateContentResponse, GeminiRequestPart } from './types';

function stripCodeFence(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function parseJsonObject(text: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(stripCodeFence(text));

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Gemini response is not a JSON object');
  }

  return parsed as Record<string, unknown>;
}

function extractResponseText(response: GeminiGenerateContentResponse): string {
  const text = response.candidates?.[0]?.content?.parts
    ?.map((part) => ('text' in part ? (part.text ?? '') : ''))
    .join('')
    .trim();

  if (!text) {
    throw new Error('Gemini response did not contain text');
  }

  return text;
}

export function postJsonRequest(
  systemInstruction: string,
  userText: string,
): Record<string, unknown> {
  return postJsonPartsRequest(systemInstruction, [{ text: userText }]);
}

export function postJsonPartsRequest(
  systemInstruction: string,
  parts: GeminiRequestPart[],
): Record<string, unknown> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const payload = {
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
    contents: [
      {
        parts,
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
    },
  };
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  const statusCode = response.getResponseCode();
  const body = response.getContentText();

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`Gemini API request failed (${statusCode}): ${body}`);
  }

  const parsedResponse = JSON.parse(body) as GeminiGenerateContentResponse;
  const responseText = extractResponseText(parsedResponse);

  return parseJsonObject(responseText);
}
