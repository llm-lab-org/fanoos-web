/**
 * Generates a short WAV sample audio clip for player previews in settings.
 * Produces a simple 4-note melody (C-E-G-E) at 22050 Hz, ~4 seconds.
 */

let cachedUrl: string | null = null;

function writeString(view: DataView, offset: number, str: string): void {
    for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
    }
}

export function getSampleAudioUrl(): string {
    if (cachedUrl) return cachedUrl;

    const sampleRate = 22050;
    const notes = [523, 659, 784, 659]; // C5, E5, G5, E5
    const noteDuration = 0.8; // seconds per note
    const totalDuration = notes.length * noteDuration;
    const numSamples = Math.floor(sampleRate * totalDuration);
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);

    // WAV RIFF header
    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + numSamples * 2, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);      // PCM chunk size
    view.setUint16(20, 1, true);       // PCM format
    view.setUint16(22, 1, true);       // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);       // block align
    view.setUint16(34, 16, true);      // bits per sample
    writeString(view, 36, "data");
    view.setUint32(40, numSamples * 2, true);

    for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        const noteIdx = Math.min(Math.floor(t / noteDuration), notes.length - 1);
        const tInNote = (t % noteDuration) / noteDuration;
        // simple ADSR envelope: quick attack, sustain, quick release
        const envelope = Math.min(1, tInNote * 20) * Math.min(1, (1 - tInNote) * 10) * 0.4;
        const freq = notes[noteIdx];
        const sample = Math.sin(2 * Math.PI * freq * t) * envelope;
        view.setInt16(44 + i * 2, Math.round(sample * 32767), true);
    }

    const blob = new Blob([buffer], { type: "audio/wav" });
    cachedUrl = URL.createObjectURL(blob);
    return cachedUrl;
}
