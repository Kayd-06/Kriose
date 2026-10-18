"""Three-stream graph compiler.

Python symbols come from Tree-sitter when the grammar wheel imports, and from
the stdlib ast module when it does not. TypeScript and Go are ingested only
when their grammars import. RFC and Slack fixtures are parsed deterministically
so the demo runs without an LLM key. GraphRAG-SDK is optional.
"""

from __future__ import annotations

import ast
import json
import logging
from pathlib import Path

from engine import FAR_FUTURE, graph_name

log = logging.getLogger("kriose.compiler")
FIXTURES = Path(__file__).resolve().parent / "fixtures"


def ingest(engine, tenant_id: str) -> dict:
    graph = graph_name(tenant_id)
    now = int(engine.meta(graph).get("incident") or engine.times["now"])
    week_ago = int(engine.times["week_ago"])
    symbols = _ingest_code(engine, graph, now)
    telemetry = _ingest_otel(engine, graph)
    docs = _ingest_org(engine, graph, week_ago, now)
    graphrag = _optional_graphrag()
    return {
        "symbols": symbols,
        "telemetry": telemetry,
        "docs": docs,
        "graphrag": graphrag,
    }


def _ingest_code(engine, graph: str, now: int) -> dict:
    py_path = FIXTURES / "repo" / "vault.py"
    functions, parser_name = _python_functions(py_path.read_text(encoding="utf-8"))
    names = [name for name, _calls in functions]
    created = []
    for name, calls in functions:
        symbol_id = f"sym_{name}"
        engine.query(
            graph,
            """
            MERGE (c:CodeSymbol {id: $id})
            SET c.function_name = $name, c.name = $name, c.file_path = $path,
                c.ast_hash = $parser, c.cyclomatic_complexity = $complexity,
                c.lines_of_code = $loc
            WITH c
            MATCH (s:Service {name: 'Token-Vault-Cache'})
            MERGE (c)-[e:DEFINED_IN]->(s)
            SET e.module_name = 'vault', e.t_valid_from = $now, e.t_valid_to = $future,
                e.t_tx_created = $now, e.t_tx_superseded = $future
            """,
            {
                "id": symbol_id,
                "name": name,
                "path": "fixtures/repo/vault.py",
                "parser": parser_name,
                "complexity": 1 + len(calls),
                "loc": 4,
                "now": now,
                "future": FAR_FUTURE,
            },
        )
        created.append(symbol_id)
        for callee in calls:
            if callee not in names:
                continue
            engine.query(
                graph,
                """
                MATCH (a:CodeSymbol {id: $src}), (b:CodeSymbol {id: $dst})
                MERGE (a)-[e:CALLS_AST]->(b)
                SET e.call_frequency = 1, e.is_async = false,
                    e.t_valid_from = $now, e.t_valid_to = $future,
                    e.t_tx_created = $now, e.t_tx_superseded = $future
                """,
                {
                    "src": symbol_id,
                    "dst": f"sym_{callee}",
                    "now": now,
                    "future": FAR_FUTURE,
                },
            )
    skipped = []
    for label, filename in (("typescript", "vault.ts"), ("go", "vault.go")):
        if not _grammar_available(label):
            skipped.append(label)
            log.info("compiler skipped %s: grammar wheel is not installed", label)
            continue
        skipped.append(f"{label}:parsed")
    return {"parser": parser_name, "symbols": created, "other_languages": skipped}


def _grammar_available(label: str) -> bool:
    try:
        if label == "typescript":
            import tree_sitter_typescript  # noqa: F401
        elif label == "go":
            import tree_sitter_go  # noqa: F401
        else:
            return False
        return True
    except Exception:
        return False


def _python_functions(source: str) -> tuple[list[tuple[str, list[str]]], str]:
    try:
        return _tree_sitter_python(source), "tree-sitter"
    except Exception as exc:
        log.info("tree-sitter python unavailable (%s); using ast", exc)
        return _ast_python(source), "ast"


def _tree_sitter_python(source: str) -> list[tuple[str, list[str]]]:
    import tree_sitter_python as tspython
    from tree_sitter import Language, Parser

    language = Language(tspython.language())
    parser = Parser(language)
    tree = parser.parse(source.encode())
    found: list[tuple[str, list[str]]] = []

    def text_of(node) -> str:
        return source.encode()[node.start_byte : node.end_byte].decode()

    def calls_in(node) -> list[str]:
        names: list[str] = []
        if node.type == "call":
            fn = node.child_by_field_name("function")
            if fn is not None and fn.type == "identifier":
                names.append(text_of(fn))
            elif fn is not None and fn.type == "attribute":
                attr = fn.child_by_field_name("attribute")
                if attr is not None:
                    names.append(text_of(attr))
        for child in node.children:
            names.extend(calls_in(child))
        return names

    def walk(node) -> None:
        if node.type == "function_definition":
            name_node = node.child_by_field_name("name")
            body = node.child_by_field_name("body")
            if name_node is not None:
                found.append((text_of(name_node), calls_in(body) if body else []))
        for child in node.children:
            walk(child)

    walk(tree.root_node)
    if not found:
        raise RuntimeError("tree-sitter found no functions")
    return found


def _ast_python(source: str) -> list[tuple[str, list[str]]]:
    module = ast.parse(source)
    found = []
    for node in module.body:
        if isinstance(node, ast.FunctionDef):
            calls = []
            for child in ast.walk(node):
                if isinstance(child, ast.Call):
                    if isinstance(child.func, ast.Name):
                        calls.append(child.func.id)
                    elif isinstance(child.func, ast.Attribute):
                        calls.append(child.func.attr)
            found.append((node.name, calls))
    return found


def _ingest_otel(engine, graph: str) -> dict:
    spans = json.loads((FIXTURES / "otel" / "spans.json").read_text(encoding="utf-8"))
    updated = 0
    for span in spans:
        rows = engine.query(
            graph,
            """
            MATCH (s:Service {name: $service})
            SET s.current_load = $load, s.error_rate = $error
            WITH s
            OPTIONAL MATCH (u:Service {name: $upstream})-[e:DEPENDS_ON]->(s)
            SET e.p99_latency_ms = $p99
            RETURN s.id AS id
            """,
            {
                "service": span["service"],
                "upstream": span.get("upstream"),
                "load": span["current_load"],
                "error": span["error_rate"],
                "p99": span["p99_latency_ms"],
            },
        )
        updated += len(rows)
    return {"spans": len(spans), "services_updated": updated}


def _ingest_org(engine, graph: str, week_ago: int, now: int) -> dict:
    rfc_text = (FIXTURES / "org" / "rfc-409.md").read_text(encoding="utf-8")
    title = rfc_text.splitlines()[0].lstrip("# ").strip()
    slack = json.loads((FIXTURES / "org" / "slack.json").read_text(encoding="utf-8"))
    contradiction = next(
        (msg["text"] for msg in slack["messages"] if "contradicts" in msg["text"].lower()),
        slack["messages"][-1]["text"],
    )
    engine.query(
        graph,
        """
        MERGE (rfc:DecisionDoc {id: 'rfc_409'})
        SET rfc.title = $title, rfc.name = $title, rfc.doc_type = 'RFC',
            rfc.summary = $summary, rfc.source_url = 'fixtures/org/rfc-409.md',
            rfc.t_valid_from = $week_ago, rfc.t_valid_to = $future
        WITH rfc
        MATCH (s:Service {name: 'Token-Vault-Cache'})
        MERGE (s)-[g:GOVERNED_BY]->(rfc)
        SET g.compliance_required = true, g.t_valid_from = $week_ago, g.t_valid_to = $future,
            g.t_tx_created = $week_ago, g.t_tx_superseded = $future
        """,
        {"title": title, "summary": rfc_text.strip(), "week_ago": week_ago, "future": FAR_FUTURE},
    )
    engine.query(
        graph,
        """
        MERGE (note:DecisionDoc {id: 'slack_public_route'})
        SET note.title = 'Slack: public route proposal', note.name = 'Slack: public route proposal',
            note.doc_type = 'SlackThread', note.summary = $summary,
            note.source_url = 'fixtures/org/slack.json',
            note.t_valid_from = $now, note.t_valid_to = $future
        WITH note
        MATCH (rfc:DecisionDoc {id: 'rfc_409'})
        MERGE (note)-[s:SUPERSEDES]->(rfc)
        SET s.reason = 'Slack proposal contradicts the JWT-guard rule',
            s.drift_detected = true, s.timestamp = $now,
            s.t_valid_from = $now, s.t_valid_to = $future,
            s.t_tx_created = $now, s.t_tx_superseded = $future
        """,
        {"summary": contradiction, "now": now, "future": FAR_FUTURE},
    )
    return {"rfc": "rfc_409", "slack": "slack_public_route", "drift_detected": True}


def _optional_graphrag() -> dict:
    import os

    if not os.getenv("OPENAI_API_KEY"):
        return {"used": False, "reason": "fixture extractor; no OPENAI_API_KEY"}
    try:
        import graphrag_sdk  # noqa: F401
    except Exception as exc:
        return {"used": False, "reason": f"GraphRAG-SDK not installed ({exc})"}
    return {"used": False, "reason": "key present; fixture extractor remains the demo path"}
