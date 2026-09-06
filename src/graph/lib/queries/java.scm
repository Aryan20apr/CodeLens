;--- functions
(method_declaration name: (identifier) @function.name) @function.def
(constructor_declaration name: (identifier) @function.name) @function.def

;--- classes
(class_declaration name: (identifier) @class.name) @class.def
(interface_declaration name: (identifier) @class.name) @class.def
(enum_declaration name: (identifier) @class.name) @class.def

;--- imports
(import_declaration (scoped_identifier) @import.source)

;--- entry_points
(method_declaration name: (identifier) @entry (#eq? @entry "main"))