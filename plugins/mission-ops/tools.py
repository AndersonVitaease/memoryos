"""Shim de interface: o loader do Hermes (plugins_loader.py) procura
`register_tools(ctx)` em tools.py; a implementação da MISSÃO
MISSION-OPS-01 vive em register(ctx) no __init__.py. Este módulo apenas
expõe a função com o nome que o loader espera — zero lógica duplicada.
"""
from . import register as _register


def register_tools(ctx):
    _register(ctx)
