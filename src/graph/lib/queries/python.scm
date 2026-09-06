;--- functions
(function_definition name: (identifier) @function.name) @function.def

;--- classes
(class_definition name: (identifier) @class.name) @class.def

;--- imports
(import_statement name: (dotted_name) @import.source)
(import_from_statement module_name: (dotted_name) @import.source)

;--- entry_points
(function_definition name: (identifier) @entry (#eq? @entry "main"))