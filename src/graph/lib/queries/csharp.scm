;--- functions
(method_declaration name: (identifier) @function.name) @function.def
(constructor_declaration name: (identifier) @function.name) @function.def
(local_function_statement name: (identifier) @function.name) @function.def

;--- classes
(class_declaration name: (identifier) @class.name) @class.def
(interface_declaration name: (identifier) @class.name) @class.def
(struct_declaration name: (identifier) @class.name) @class.def
(enum_declaration name: (identifier) @class.name) @class.def

;--- imports
(using_directive (qualified_name) @import.source)
(using_directive (identifier) @import.source)

;--- entry_points
(method_declaration name: (identifier) @entry (#eq? @entry "Main"))
