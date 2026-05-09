;--- functions
(function_declaration name: (identifier) @function.name)
(method_declaration name: (field_identifier) @function.name)

;--- classes
; (no classes in Go) keep empty but required by loader
; Use structs as "classes" for now
(type_spec name: (type_identifier) @class.name type: (struct_type))

;--- imports
(import_spec path: (interpreted_string_literal) @import.source)

;--- entry_points
(function_declaration name: (identifier) @entry)