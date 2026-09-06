;--- functions
(function_declaration (simple_identifier) @function.name) @function.def

;--- classes
(class_declaration (type_identifier) @class.name) @class.def
(object_declaration (type_identifier) @class.name) @class.def

;--- imports
(import_header (identifier) @import.source)

;--- entry_points
(function_declaration (simple_identifier) @entry (#eq? @entry "main"))
