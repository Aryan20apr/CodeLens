;--- functions
(function_declaration name: (identifier) @function.name)
(method_definition name: (property_identifier) @function.name)
(arrow_function (identifier) @function.name)
(variable_declarator name: (identifier) @function.name value: (arrow_function))

;--- classes
(class_declaration name: (type_identifier) @class.name)

;--- imports
(import_statement source: (string) @import.source)

;--- entry_points
(export_statement) @entry
(export_default_declaration) @entry