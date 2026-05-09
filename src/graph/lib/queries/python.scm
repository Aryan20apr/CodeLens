;--- functions
(function_definition name: (identifier) @function.name)

;--- classes
(class_definition name: (identifier) @class.name)

;--- imports
(import_statement name: (dotted_name) @import.source)
(import_from_statement module_name: (dotted_name) @import.source)

;--- entry_points
(if_statement
  condition: (comparison_operator
    left: (identifier) @entry
    right: (string) @entry))