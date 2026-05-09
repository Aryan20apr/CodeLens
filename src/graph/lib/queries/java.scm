;--- functions
(method_declaration name: (identifier) @function.name)
(constructor_declaration name: (identifier) @function.name)

;--- classes
(class_declaration name: (identifier) @class.name)
(interface_declaration name: (identifier) @class.name)
(enum_declaration name: (identifier) @class.name)

;--- imports
(import_declaration (scoped_identifier) @import.source)

;--- entry_points
(method_declaration name: (identifier) @entry)