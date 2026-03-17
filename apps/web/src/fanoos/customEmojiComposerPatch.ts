/*
 * Patches the wysiwyg and plain-text composer contenteditable areas so that
 * custom flower emoji (U+E000–U+E007, Private Use Area) are rendered as <img>
 * elements instead of invisible glyph-less characters.
 *
 * The <img> elements are injected with contenteditable="false" and alt set to
 * the original PUA character so that the editor's text serialisation still
 * reads the correct unicode value when building the message body.
 */

import { CUSTOM_EMOJI_IMAGES } from "./customFlowerEmojis";

const PATCHED = Symbol("fanoos_patched");

/** Replace all PUA flower chars in a text node with <img> siblings. */
function patchTextNode(node: Text): void {
    const text = node.nodeValue ?? "";
    let hasCustom = false;
    for (let i = 0; i < text.length; i++) {
        if (CUSTOM_EMOJI_IMAGES[text[i]]) {
            hasCustom = true;
            break;
        }
    }
    if (!hasCustom) return;

    const parent = node.parentNode;
    if (!parent) return;
    // Don't double-patch an already-replaced node
    if ((parent as Element & { [PATCHED]?: boolean })[PATCHED]) return;

    const frag = document.createDocumentFragment();
    let start = 0;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const src = CUSTOM_EMOJI_IMAGES[char];
        if (src) {
            if (i > start) frag.appendChild(document.createTextNode(text.slice(start, i)));
            const img = document.createElement("img");
            img.src = src;
            img.alt = char;
            img.contentEditable = "false";
            img.className = "mx_CustomFlowerEmoji";
            img.style.cssText = "height:1.2em;vertical-align:-0.25em;display:inline-block;pointer-events:none";
            frag.appendChild(img);
            start = i + 1;
        }
    }
    if (start < text.length) frag.appendChild(document.createTextNode(text.slice(start)));

    parent.replaceChild(frag, node);
}

/** Walk all text nodes inside an element and patch any containing PUA chars. */
function patchSubtree(root: Node): void {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
            // Skip alt text inside already-patched <img> elements
            const p = node.parentNode;
            if (p instanceof HTMLImageElement && p.classList.contains("mx_CustomFlowerEmoji")) {
                return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
        },
    });
    // Collect first, then patch (modifying live DOM during walk is unsafe)
    const nodes: Text[] = [];
    let n: Node | null;
    while ((n = walker.nextNode())) nodes.push(n as Text);
    for (const node of nodes) patchTextNode(node);
}

/** Start observing a contenteditable element. */
function watchEditor(el: Element): void {
    if ((el as Element & { [PATCHED]?: boolean })[PATCHED]) return;
    (el as Element & { [PATCHED]?: boolean })[PATCHED] = true;

    // Patch existing content
    patchSubtree(el);

    const obs = new MutationObserver((mutations) => {
        // Use a microtask so we run after the wysiwyg lib's own observer
        queueMicrotask(() => {
            for (const m of mutations) {
                if (m.type === "characterData") {
                    patchTextNode(m.target as Text);
                } else {
                    for (const added of m.addedNodes) {
                        if (added.nodeType === Node.TEXT_NODE) {
                            patchTextNode(added as Text);
                        } else if (added.nodeType === Node.ELEMENT_NODE) {
                            patchSubtree(added);
                        }
                    }
                }
            }
        });
    });

    obs.observe(el, { childList: true, subtree: true, characterData: true });
}

/** Watch for contenteditable elements added anywhere in the document. */
export function initCustomEmojiComposerPatch(): void {
    // Watch existing editors
    document.querySelectorAll<Element>("[contenteditable]").forEach(watchEditor);

    // Watch for new editors mounted later (e.g. room switch, dialog open)
    new MutationObserver((mutations) => {
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (!(node instanceof Element)) continue;
                if (node.hasAttribute("contenteditable")) watchEditor(node);
                node.querySelectorAll<Element>("[contenteditable]").forEach(watchEditor);
            }
        }
    }).observe(document.body, { childList: true, subtree: true });
}
