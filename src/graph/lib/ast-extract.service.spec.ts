import { Logger } from 'winston';
import { AstExtractService } from './ast-extract.service';
import { TreeSitterService } from './tree-sitter/tree-sitter.service';
import { QueryLoaderService } from './queries/query-loader.service';
import { mapAddedLinesToSymbols } from '../../review/enrichment/map-added-lines-to-symbols.util';

describe('AstExtractService', () => {
  let service: AstExtractService;
  let treeSitter: TreeSitterService;
  let queryLoader: QueryLoaderService;

  const mockLogger = {
    child: jest.fn().mockReturnThis(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as Logger;

  beforeAll(async () => {
    treeSitter = new TreeSitterService(mockLogger);
    queryLoader = new QueryLoaderService();
    service = new AstExtractService(mockLogger, treeSitter, queryLoader);
  });

  afterAll(() => {
    service.onModuleDestroy();
  });

  describe('TypeScript symbol spans & lambda filtering', () => {
    it('captures full startLine and endLine for functions and classes', async () => {
      const tsCode = [
        '// line 1',
        'export function calculateTax(income: number): number {',
        '  const rate = 0.2;',
        '  return income * rate;',
        '}',
        '',
        'export class UserService {',
        '  findById(id: string) {',
        '    return { id };',
        '  }',
        '}',
      ].join('\n');

      const metadata = await service.buildMetadata(tsCode, 'typescript');

      const fn = metadata.functions.find((f) => f.name === 'calculateTax');
      expect(fn).toBeDefined();
      expect(fn?.startLine).toBe(2);
      expect(fn?.endLine).toBe(5);

      const cls = metadata.classes.find((c) => c.name === 'UserService');
      expect(cls).toBeDefined();
      expect(cls?.startLine).toBe(7);
      expect(cls?.endLine).toBe(11);

      const method = metadata.functions.find((f) => f.name === 'findById');
      expect(method).toBeDefined();
      expect(method?.startLine).toBe(8);
      expect(method?.endLine).toBe(10);
    });

    it('correctly maps added lines inside a function body to that symbol', async () => {
      const tsCode = [
        'function processData(items: string[]): string[] {',
        '  const trimmed = items.map(s => s.trim());',
        '  return trimmed;',
        '}',
      ].join('\n');

      const metadata = await service.buildMetadata(tsCode, 'typescript');
      const mapped = mapAddedLinesToSymbols([2], metadata.functions, metadata.classes);

      expect(mapped).toHaveLength(1);
      expect(mapped[0]).toEqual({
        line: 2,
        symbolKind: 'function',
        symbolName: 'processData',
      });
    });

    it('does not miscapture lambda parameters as functions', async () => {
      const tsCode = `
        const doubled = [1, 2, 3].map(n => n * 2);
        const filtered = doubled.filter(item => item > 2);
      `;

      const metadata = await service.buildMetadata(tsCode, 'typescript');

      const names = metadata.functions.map((f) => f.name);
      expect(names).not.toContain('n');
      expect(names).not.toContain('item');
    });

    it('captures arrow functions assigned to variables with their full span', async () => {
      const tsCode = [
        'const multiply = (a: number, b: number) => {',
        '  const result = a * b;',
        '  return result;',
        '};',
      ].join('\n');

      const metadata = await service.buildMetadata(tsCode, 'typescript');
      const fn = metadata.functions.find((f) => f.name === 'multiply');

      expect(fn).toBeDefined();
      expect(fn?.startLine).toBe(1);
      expect(fn?.endLine).toBe(4);
    });
  });

  describe('TSX Parsing', () => {
    it('parses React TSX components cleanly without syntax errors', async () => {
      const tsxCode = `
        import React from 'react';

        interface Props {
          name: string;
        }

        export const Greeting: React.FC<Props> = ({ name }) => {
          return (
            <div className="greeting">
              <h1>Hello, {name}!</h1>
            </div>
          );
        };
      `;

      const metadata = await service.buildMetadata(tsxCode, 'tsx');

      expect(metadata.functions.some((f) => f.name === 'Greeting')).toBe(true);
      expect(metadata.classes.some((c) => c.name === 'Props')).toBe(true);
      expect(metadata.imports).toContain('react');
    });
  });

  describe('Entry point precision', () => {
    it('only captures main as an entry point in Go', async () => {
      const goCode = `
        package main
        import "fmt"
        func helper() { fmt.Println("helper") }
        func main() { fmt.Println("main") }
      `;

      const metadata = await service.buildMetadata(goCode, 'go');

      expect(metadata.entryPoints).toEqual(['main']);
    });

    it('only captures main as an entry point in Rust', async () => {
      const rustCode = `
        use std::io;
        fn helper() {}
        fn main() { println!("main"); }
      `;

      const metadata = await service.buildMetadata(rustCode, 'rust');

      expect(metadata.entryPoints).toEqual(['main']);
    });

    it('only captures main as an entry point in Java', async () => {
      const javaCode = `
        package com.example;
        import java.util.List;
        public class App {
          public void doWork() {}
          public static void main(String[] args) {}
        }
      `;

      const metadata = await service.buildMetadata(javaCode, 'java');

      expect(metadata.entryPoints).toEqual(['main']);
    });
  });

  describe('Additional language support', () => {
    it('extracts methods, classes, and using imports in C#', async () => {
      const csCode = `
        using System;
        using System.Collections.Generic;

        namespace Demo
        {
          public class Worker
          {
            public void Run()
            {
              Console.WriteLine("running");
            }

            public static void Main(string[] args)
            {
            }
          }
        }
      `;

      const metadata = await service.buildMetadata(csCode, 'csharp');

      expect(metadata.classes.some((c) => c.name === 'Worker')).toBe(true);
      expect(metadata.functions.some((f) => f.name === 'Run')).toBe(true);
      expect(metadata.entryPoints).toContain('Main');
      expect(metadata.imports).toContain('System');
    });

    it('extracts functions, classes, and imports in Kotlin', async () => {
      const ktCode = `
        package demo
        import java.io.File

        class Service {
          fun execute(): String {
            return "done"
          }
        }

        fun main() {
          println("start")
        }
      `;

      const metadata = await service.buildMetadata(ktCode, 'kotlin');

      expect(metadata.classes.some((c) => c.name === 'Service')).toBe(true);
      expect(metadata.functions.some((f) => f.name === 'execute')).toBe(true);
      expect(metadata.entryPoints).toContain('main');
    });
  });
});
