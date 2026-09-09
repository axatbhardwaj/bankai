#!/usr/bin/env python3
"""Validate the static contract for an HTML deliverable."""

import datetime as dt
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path


TOKENS = {
    "ground": "#0b0f14", "panel": "#121821", "panel2": "#182130",
    "line": "#26303e", "ink": "#dce4ee", "dim": "#8a97a8",
    "faint": "#5c6774", "primary": "#34d399", "secondary": "#a78bfa",
    "team": "#5ca9ff", "human": "#e0a63d", "seal": "#46c26a",
    "stop": "#ff6a5e",
}

VOID_ELEMENTS = {
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
}

P_BREAKERS = {
    "address", "article", "aside", "blockquote", "div", "dl", "fieldset",
    "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header",
    "hgroup", "hr", "main", "menu", "nav", "ol", "p", "pre", "search",
    "section", "table", "ul",
}

IMPLICIT_START_CLOSE = {
    "p": P_BREAKERS,
    "li": {"li"},
    "dt": {"dt", "dd"},
    "dd": {"dt", "dd"},
    "tr": {"tr"},
    "td": {"td", "th"},
    "th": {"td", "th"},
}

IMPLICIT_END_CLOSE = {
    "p": P_BREAKERS | {"body", "html"},
    "li": {"menu", "ol", "ul"},
    "dt": {"dl"},
    "dd": {"dl"},
    "tr": {"table", "tbody", "tfoot", "thead"},
    "td": {"table", "tbody", "tfoot", "thead", "tr"},
    "th": {"table", "tbody", "tfoot", "thead", "tr"},
}


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate metadata key: {key}")
        result[key] = value
    return result


class ContractParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.doctype = False
        self.title_depth = 0
        self.title = []
        self.meta_depth = 0
        self.meta_blocks = []
        self.figures = []
        self.figure = None
        self.foot_depth = 0
        self.foot_text = []
        self.section_ids = []
        self.section_stack = []
        self.section_texts = {}
        self.active_section_texts = []
        self.active_section_exclusions = []
        self.reader_summary_ids = []
        self.summary_item_locations = {}
        self.decision_front_ids = []
        self.decision_options = []
        self.decision_option_items = []
        self.inside_decision_options = False
        self.decision_recommendations = []
        self.decision_asks = []
        self.decision_front_depth = 0
        self.decision_front_text = []
        self.decision_front_visibility = []
        self.visibility_stack = []
        self.element_order = 0
        self.h1_before_sections = []
        self.thesis_before_sections = []
        self.status_before_sections = False
        self.text_blocks = {}
        self.active_text_blocks = {}
        self.required_placeholders = []

    def _extend_text_blocks(self, tag):
        if tag not in VOID_ELEMENTS:
            for capture in self.active_text_blocks:
                capture["open_tags"].append(tag)

    def _close_implicit_text_blocks(self, tag, rules):
        self.active_text_blocks = [
            capture for capture in self.active_text_blocks
            if tag not in rules.get(
                capture.get("boundary_tag") or capture["open_tags"][0], set()
            )
        ]

    def _start_text_block(self, kind, tag, boundary_tag=None):
        text = []
        self.text_blocks.setdefault(kind, []).append(text)
        self.active_text_blocks.append({
            "kind": kind,
            "open_tags": [tag],
            "text": text,
            "boundary_tag": boundary_tag,
        })

    def _end_text_blocks(self, tag):
        for capture in list(self.active_text_blocks):
            open_tags = capture["open_tags"]
            if tag == capture.get("boundary_tag"):
                open_tags.clear()
            elif tag in open_tags:
                matching_index = len(open_tags) - 1 - open_tags[::-1].index(tag)
                del open_tags[matching_index:]
            elif tag in IMPLICIT_END_CLOSE.get(open_tags[0], set()):
                open_tags.clear()
            if not open_tags:
                self.active_text_blocks.remove(capture)

    def _extend_section_exclusions(self, tag):
        if tag not in VOID_ELEMENTS:
            for capture in self.active_section_exclusions:
                capture.append(tag)

    def _close_implicit_section_exclusions(self, tag, rules):
        self.active_section_exclusions = [
            capture for capture in self.active_section_exclusions
            if tag not in rules.get(capture[0], set())
        ]

    def _end_section_exclusions(self, tag):
        if tag == "section":
            self.active_section_exclusions.clear()
            return
        for capture in list(self.active_section_exclusions):
            if tag in capture:
                matching_index = len(capture) - 1 - capture[::-1].index(tag)
                del capture[matching_index:]
            elif tag in IMPLICIT_END_CLOSE.get(capture[0], set()):
                capture.clear()
            if not capture:
                self.active_section_exclusions.remove(capture)

    def handle_decl(self, decl):
        self.doctype |= decl.lower() == "doctype html"

    def handle_starttag(self, tag, attrs):
        self.element_order += 1
        values = dict(attrs)
        classes = set(values.get("class", "").split())
        style = values.get("style") or ""
        hidden_here = (
            "hidden" in values
            or values.get("aria-hidden", "").lower() == "true"
            or re.search(r"(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)", style, re.I)
        )
        visible = not hidden_here and all(
            not hidden for _, hidden, _ in self.visibility_stack
        )
        outside_disclosure = not any(
            disclosure for _, _, disclosure in self.visibility_stack
        )
        if tag not in VOID_ELEMENTS:
            self.visibility_stack.append((tag, bool(hidden_here), tag == "details"))
        if self.decision_front_depth and tag not in VOID_ELEMENTS:
            self.decision_front_depth += 1
        elif tag == "section" and "data-decision-front" in values:
            self.decision_front_depth = 1
        self._close_implicit_text_blocks(tag, IMPLICIT_START_CLOSE)
        self._extend_text_blocks(tag)
        self._close_implicit_section_exclusions(tag, IMPLICIT_START_CLOSE)
        self._extend_section_exclusions(tag)
        if self.active_section_texts and (
            "eyebrow" in classes
            or tag in {"h1", "h2", "h3", "h4", "h5", "h6", "summary"}
        ):
            self.active_section_exclusions.append([tag])
        if "status" in classes:
            self._start_text_block("status", tag)
            self.status_before_sections |= not self.section_ids
        if "data-status-answer" in values and any(
            capture["kind"] == "status" for capture in self.active_text_blocks
        ):
            status_capture = next(
                capture for capture in reversed(self.active_text_blocks)
                if capture["kind"] == "status"
            )
            self._start_text_block(
                "status-answer", tag, status_capture["open_tags"][0]
            )
        if "next" in classes:
            self._start_text_block("next", tag)
        if "data-next-answer" in values and any(
            capture["kind"] == "next" for capture in self.active_text_blocks
        ):
            next_capture = next(
                capture for capture in reversed(self.active_text_blocks)
                if capture["kind"] == "next"
            )
            self._start_text_block(
                "next-answer", tag, next_capture["open_tags"][0]
            )
        if tag == "section":
            section_id = values.get("id")
            is_reader_summary = "data-reader-summary" in values
            section_text = []
            self.section_ids.append(section_id)
            self.section_stack.append((section_id, is_reader_summary))
            self.section_texts.setdefault(section_id, []).append(section_text)
            self.active_section_texts.append(section_text)
            if is_reader_summary:
                self.reader_summary_ids.append(section_id)
            if "data-decision-front" in values:
                self.decision_front_ids.append(section_id)
                self.decision_front_visibility.append(
                    (visible, outside_disclosure)
                )
        in_summary = any(section_id == "summary" for section_id, _ in self.section_stack)
        if "data-options" in values:
            self.decision_options.append(
                (self.element_order, tag, in_summary, visible, outside_disclosure)
            )
            self.inside_decision_options = tag == "table"
        if "data-option" in values:
            self.decision_option_items.append(
                (
                    tag, in_summary, self.inside_decision_options,
                    visible, outside_disclosure,
                )
            )
        if "data-recommendation" in values:
            self.decision_recommendations.append(
                (self.element_order, in_summary, visible, outside_disclosure)
            )
        if "data-decision-ask" in values:
            self.decision_asks.append(
                (self.element_order, in_summary, visible, outside_disclosure)
            )
        if "data-summary" in values:
            summary_kind = values["data-summary"]
            self._start_text_block(f"summary:{summary_kind}", tag)
            self.summary_item_locations.setdefault(summary_kind, []).append(
                any(is_summary for _, is_summary in self.section_stack)
            )
        if "data-summary-answer" in values:
            summary_capture = next(
                (capture for capture in reversed(self.active_text_blocks)
                 if capture["kind"].startswith("summary:")),
                None,
            )
            if summary_capture is not None:
                summary_kind = summary_capture["kind"].split(":", 1)[1]
                self._start_text_block(f"summary-answer:{summary_kind}", tag)
        if tag == "details" and "technical" in classes:
            self._start_text_block("technical", tag)
        if tag == "summary" and any(
            capture["kind"] == "technical"
            for capture in self.active_text_blocks
        ):
            self._start_text_block("technical-label", tag)
        if tag == "h1":
            self._start_text_block("h1", tag)
            self.h1_before_sections.append(not self.section_ids)
        if "thesis" in classes:
            self._start_text_block("thesis", tag)
            self.thesis_before_sections.append(not self.section_ids)
        if tag == "title":
            self.title_depth += 1
        if tag == "script" and values.get("id") == "html-deliverable-meta":
            if values.get("type", "").lower() != "application/json":
                self.meta_blocks.append(None)
            else:
                self.meta_blocks.append([])
            self.meta_depth += 1
        if tag == "figure":
            self.figure = {"svg": False, "svg_label": "", "caption_depth": 0, "caption": []}
        elif self.figure is not None and tag == "svg":
            self.figure["svg"] = True
            self.figure["svg_label"] = values.get("aria-label", "")
        elif self.figure is not None and tag == "figcaption":
            self.figure["caption_depth"] += 1
        if "foot" in classes:
            self.foot_depth += 1

    def handle_endtag(self, tag):
        self._end_text_blocks(tag)
        self._end_section_exclusions(tag)
        if tag == "section" and self.section_stack:
            self.section_stack.pop()
            self.active_section_texts.pop()
        if tag == "title" and self.title_depth:
            self.title_depth -= 1
        if tag == "script" and self.meta_depth:
            self.meta_depth -= 1
        if tag == "figcaption" and self.figure is not None:
            self.figure["caption_depth"] -= 1
        if tag == "figure" and self.figure is not None:
            self.figures.append(self.figure)
            self.figure = None
        if tag == "table" and self.inside_decision_options:
            self.inside_decision_options = False
        if self.decision_front_depth and tag not in VOID_ELEMENTS:
            self.decision_front_depth -= 1
        if tag not in VOID_ELEMENTS:
            for index in range(len(self.visibility_stack) - 1, -1, -1):
                if self.visibility_stack[index][0] == tag:
                    del self.visibility_stack[index:]
                    break
        if self.foot_depth and tag in {"p", "div", "footer"}:
            self.foot_depth -= 1

    def handle_data(self, data):
        if self.decision_front_depth:
            self.decision_front_text.append(data)
        if self.title_depth:
            self.title.append(data)
        if self.meta_depth and self.meta_blocks and self.meta_blocks[-1] is not None:
            self.meta_blocks[-1].append(data)
        if self.figure is not None and self.figure["caption_depth"]:
            self.figure["caption"].append(data)
        if self.foot_depth:
            self.foot_text.append(data)
        if self.active_text_blocks:
            self.active_text_blocks[-1]["text"].append(data)
        if not self.active_section_exclusions:
            for section_text in self.active_section_texts:
                section_text.append(data)

    def handle_comment(self, data):
        if data.strip().startswith("REQUIRED:"):
            self.required_placeholders.append(data.strip())


def validate(path):
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as error:
        return [f"cannot read UTF-8 HTML: {error}"]

    parser = ContractParser()
    try:
        parser.feed(text)
    except Exception as error:
        return [f"cannot parse HTML: {error}"]

    errors = []
    kind = ""
    if parser.required_placeholders:
        errors.append("unreplaced REQUIRED content placeholder")
    if not parser.doctype:
        errors.append("missing HTML5 doctype")
    if not "".join(parser.title).strip():
        errors.append("missing non-empty title")
    if len(parser.meta_blocks) != 1 or parser.meta_blocks[0] is None:
        errors.append("expected one application/json metadata block")
    else:
        try:
            meta = json.loads("".join(parser.meta_blocks[0]), object_pairs_hook=unique_object)
            if type(meta) is not dict:
                raise ValueError("metadata must be a JSON object")
            for field in ("schema", "artifact_type", "title", "date", "basis"):
                if not isinstance(meta.get(field), str) or not meta[field].strip():
                    errors.append(f"metadata {field} must be a non-empty string")
            for field in ("schema", "title", "basis"):
                value = meta.get(field, "")
                if isinstance(value, str) and ("<!--" in value or "-->" in value):
                    errors.append(f"metadata {field} contains an unreplaced placeholder")
            kind_value = meta.get("artifact_type", "")
            kind = kind_value if isinstance(kind_value, str) else ""
            if not re.fullmatch(r"[a-z][a-z0-9_]*", kind):
                errors.append("metadata artifact_type must be a lowercase identifier")
            if meta.get("schema") != f"html.artifact.{kind}.v1":
                errors.append("metadata schema must match artifact_type")
            meta_title = meta.get("title", "")
            if not isinstance(meta_title, str) or meta_title.strip() != "".join(parser.title).strip():
                errors.append("metadata title must match the HTML title")
            date_value = meta.get("date", "")
            try:
                if not isinstance(date_value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date_value):
                    raise ValueError
                dt.date.fromisoformat(date_value)
            except ValueError:
                errors.append("metadata date must use YYYY-MM-DD")
        except (json.JSONDecodeError, ValueError) as error:
            errors.append(f"invalid metadata JSON: {error}")

    if "color-scheme: dark;" not in text:
        errors.append("missing literal color-scheme: dark;")
    for name, value in TOKENS.items():
        if not re.search(rf"--{name}\s*:\s*{re.escape(value)}\s*;", text, re.I):
            errors.append(f"missing house token --{name}:{value}")
    if not re.search(r"figure\s*\{[^}]*overflow-x\s*:\s*auto", text, re.I | re.S):
        errors.append("figure must own horizontal overflow")
    if not re.search(r"svg\s*\{[^}]*min-width\s*:", text, re.I | re.S):
        errors.append("SVG needs a minimum width")
    if not re.search(r"@media\s*\(prefers-reduced-motion:\s*reduce\)", text, re.I):
        errors.append("missing reduced-motion media rule")
    if not parser.section_ids or parser.section_ids[0] != "summary":
        errors.append("the first section must be #summary")
    if parser.reader_summary_ids != ["summary"]:
        errors.append("expected #summary to be the one data-reader-summary section")
    for section_id in ("scope", "evidence", "decisions", "plan"):
        section_count = parser.section_ids.count(section_id)
        if section_count != 1:
            errors.append(f"expected one #{section_id} section")
        elif not "".join(parser.section_texts[section_id][0]).strip():
            errors.append(f"expected #{section_id} section to contain non-empty body content")
    status_blocks = parser.text_blocks.get("status", [])
    if len(status_blocks) > 1:
        errors.append("duplicate current-status blocks")
    elif not status_blocks:
        errors.append("expected one non-empty current-status block")
    elif not parser.status_before_sections:
        errors.append("current-status block must appear before the first section")
    status_answers = parser.text_blocks.get("status-answer", [])
    if len(status_answers) > 1:
        errors.append("duplicate current-status answers")
    elif not status_answers:
        errors.append("expected one designated current-status answer")
    elif not "".join(status_answers[0]).strip():
        errors.append("expected one non-empty current-status answer")
    next_blocks = parser.text_blocks.get("next", [])
    if len(next_blocks) > 1:
        errors.append("duplicate next-action statements")
    elif not next_blocks:
        errors.append("expected one non-empty next-action statement")
    next_answers = parser.text_blocks.get("next-answer", [])
    if len(next_answers) > 1:
        errors.append("duplicate next-action answers")
    elif not next_answers:
        errors.append("expected one designated next-action answer")
    elif not "".join(next_answers[0]).strip():
        errors.append("expected one non-empty next-action statement")
    summary_item_outside = False
    for summary_kind in ("outcome", "meaning", "next"):
        items = parser.text_blocks.get(f"summary:{summary_kind}", [])
        if len(items) > 1:
            errors.append(f"duplicate {summary_kind} summary items")
        elif not items and kind != "decision":
            errors.append(f"expected one non-empty {summary_kind} summary item")
        answers = parser.text_blocks.get(f"summary-answer:{summary_kind}", [])
        if len(answers) > 1:
            errors.append(f"duplicate {summary_kind} summary answers")
        elif not answers:
            if kind != "decision":
                errors.append(f"expected one designated {summary_kind} summary answer")
        elif not "".join(answers[0]).strip():
            errors.append(f"expected one non-empty {summary_kind} summary answer")
        if False in parser.summary_item_locations.get(summary_kind, []):
            summary_item_outside = True
    if summary_item_outside:
        errors.append("summary items must be inside #summary")
    technical_blocks = parser.text_blocks.get("technical", [])
    if not technical_blocks:
        errors.append("expected at least one details.technical disclosure")
    elif any(not "".join(block).strip() for block in technical_blocks):
        errors.append("expected every details.technical disclosure to be non-empty")
    heading_blocks = parser.text_blocks.get("h1", [])
    if len(heading_blocks) > 1:
        errors.append("duplicate h1 conclusions")
    elif not heading_blocks or not "".join(heading_blocks[0]).strip():
        errors.append("expected one non-empty h1 conclusion")
    elif parser.h1_before_sections != [True]:
        errors.append("h1 conclusion must appear before the first section")
    thesis_blocks = parser.text_blocks.get("thesis", [])
    if len(thesis_blocks) > 1:
        errors.append("duplicate thesis statements")
    elif not thesis_blocks or not "".join(thesis_blocks[0]).strip():
        errors.append("expected one non-empty thesis statement")
    elif parser.thesis_before_sections != [True]:
        errors.append("thesis statement must appear before the first section")
    for figure in parser.figures:
        if not figure["svg"]:
            errors.append("every figure needs an inline SVG")
        if not figure["svg_label"].strip() or "<!--" in figure["svg_label"]:
            errors.append("every figure needs a plain-language SVG aria-label")
        if not "".join(figure["caption"]).strip():
            errors.append("every figure needs a non-empty figcaption")
    if not "".join(parser.foot_text).strip():
        errors.append("missing non-empty .foot stamp")
    if kind == "decision":
        if parser.decision_front_ids != ["summary"]:
            errors.append("expected #summary to be the one decision front")
        elif parser.decision_front_visibility != [(True, True)]:
            errors.append("decision front must be visible by default")
        front_words = len(re.findall(r"\S+", " ".join(parser.decision_front_text)))
        if front_words > 400:
            errors.append("decision front exceeds 400 words")
        if len(parser.decision_options) != 1:
            errors.append("expected one decision options table")
        elif parser.decision_options[0][1] != "table":
            errors.append("data-options must mark a table")
        elif not parser.decision_options[0][2]:
            errors.append("decision options must be inside the decision front")
        elif not parser.decision_options[0][4]:
            errors.append(
                "decision options must be visible without opening disclosures"
            )
        elif not parser.decision_options[0][3]:
            errors.append("decision options must be visible by default")
        option_items = [
            item for item in parser.decision_option_items
            if item == ("tr", True, True, True, True)
        ]
        if len(option_items) < 2:
            errors.append("decision options table needs at least two data-option rows")
        if len(parser.decision_recommendations) != 1:
            errors.append("expected one decision recommendation")
        elif not parser.decision_recommendations[0][1]:
            errors.append("decision recommendation must be inside the decision front")
        elif not parser.decision_recommendations[0][3]:
            errors.append(
                "decision recommendation must be visible without opening disclosures"
            )
        elif not parser.decision_recommendations[0][2]:
            errors.append("decision recommendation must be visible by default")
        if len(parser.decision_asks) != 1:
            errors.append("expected one decision ask")
        elif not parser.decision_asks[0][1]:
            errors.append("decision ask must be inside the decision front")
        elif not parser.decision_asks[0][3]:
            errors.append("decision ask must be visible without opening disclosures")
        elif not parser.decision_asks[0][2]:
            errors.append("decision ask must be visible by default")
        if parser.decision_options and parser.decision_recommendations:
            if parser.decision_options[0][0] > parser.decision_recommendations[0][0]:
                errors.append("decision options must precede the recommendation")
    return errors


def main():
    if len(sys.argv) != 2:
        print("usage: validate.py ARTIFACT.html", file=sys.stderr)
        return 2
    path = Path(sys.argv[1])
    errors = validate(path)
    if errors:
        for error in errors:
            print(f"html-deliverable: {error}", file=sys.stderr)
        return 1
    print(f"html-deliverable: valid {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
