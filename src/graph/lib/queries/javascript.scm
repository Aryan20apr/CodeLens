;--- functions
(function_declaration name: (identifier) @function.name) @function.def
(method_definition name: (property_identifier) @function.name) @function.def
(variable_declarator name: (identifier) @function.name value: (arrow_function)) @function.def
(variable_declarator name: (identifier) @function.name value: (function_expression)) @function.def

;--- classes
(class_declaration name: (identifier) @class.name) @class.def

;--- imports
(import_statement source: (string) @import.source)

;--- entry_points
(export_statement declaration: (function_declaration name: (identifier) @entry))
(export_statement declaration: (class_declaration name: (identifier) @entry))